"use client";

import { useCallback, useEffect, useRef } from "react";
import { getBoardTask, pollTaskUpdates } from "@/actions/task";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import { projectChannel } from "@/lib/channels";

export type ProjectSprintEvent = {
  type: string;
  sprintId?: string;
  taskId?: string;
};

/** What an incoming payload should do to the store. */
export type TaskSyncPlan = {
  /** Hand the payload to a consumer that renders the sprint list itself. */
  notifySprint: boolean;
  /** Re-read this one task. */
  patchTaskId?: string;
  /** Drop this task from the store. */
  removeTaskId?: string;
  /** Re-read every task on the project. */
  resync: boolean;
};

const NOTHING: TaskSyncPlan = { notifySprint: false, resync: false };

/**
 * Decides what a project-channel payload means for the task store.
 *
 * Split out from the hook because the suppression rules are easy to get
 * subtly wrong and a wrong answer here shows up as a stale board.
 */
export function planTaskSync(
  data: unknown,
  ctx: { currentUserId?: string; dragging: boolean; busy: boolean },
): TaskSyncPlan {
  const ev = data as (ProjectSprintEvent & { userId?: string }) | null;
  if (!ev?.type) return NOTHING;
  const held = ctx.dragging || ctx.busy;

  if (ev.type.startsWith("sprint.")) {
    // Sprint actions rewrite task stages in bulk — starting a sprint drops
    // every backlog task into Todo — yet publish no task-* event of their own.
    // A held board falls back to a full re-read, which waits out the drag
    // instead of fighting it.
    if (held) return { notifySprint: true, resync: true };
    if (ev.taskId) return { notifySprint: true, patchTaskId: ev.taskId, resync: false };
    return { notifySprint: true, resync: true };
  }

  // The project channel also carries chat payloads.
  if (!ev.type.startsWith("task-")) return NOTHING;

  // Our own drags already patched the store. We still take our own task-moved
  // when we are not dragging — e.g. a bypass we just approved.
  if (ev.userId === ctx.currentUserId && (ev.type !== "task-moved" || ctx.dragging)) {
    return NOTHING;
  }
  if (held) return NOTHING;

  if (ev.type === "task-deleted") {
    return ev.taskId
      ? { notifySprint: false, removeTaskId: ev.taskId, resync: false }
      : NOTHING;
  }
  return ev.taskId
    ? { notifySprint: false, patchTaskId: ev.taskId, resync: false }
    : NOTHING;
}

type Options = {
  projectId: string;
  /** Off for client-facing views: `project:` is a staff-only namespace. */
  enabled: boolean;
  currentUserId?: string;
  /** True while dnd-kit owns the cards — remote patches would fight the drag. */
  isDragging?: () => boolean;
  /** Extra hold, e.g. a decline dialog mid-flight. */
  isBusy?: () => boolean;
  /** `sprint.*` payloads, for consumers that render the sprint list itself. */
  onSprintEvent?: (event: ProjectSprintEvent) => void;
};

/**
 * Keeps the kanban store in step with everyone else's task edits.
 *
 * Any project view that reads the store needs this mounted — the store is only
 * as live as its subscribers, so a tab without it silently serves whatever was
 * true when the page loaded.
 */
export function useProjectTaskSync({
  projectId,
  enabled,
  currentUserId,
  isDragging,
  isBusy,
  onSprintEvent,
}: Options) {
  const cent = useCentrifugo();
  const setTasks = useKanbanStore((s) => s.setTasks);

  // Latest-callback refs so a re-render never resubscribes the channel.
  const draggingRef = useRef(isDragging);
  const busyRef = useRef(isBusy);
  const sprintRef = useRef(onSprintEvent);
  useEffect(() => {
    draggingRef.current = isDragging;
    busyRef.current = isBusy;
    sprintRef.current = onSprintEvent;
  });

  const held = useCallback(
    () => Boolean(draggingRef.current?.()) || Boolean(busyRef.current?.()),
    [],
  );

  /** Full re-read. Covers the fallback poll and reconnects that lost history. */
  const resync = useCallback(async () => {
    if (held() || document.hidden) return;
    try {
      const updates = await pollTaskUpdates(projectId);
      if (useKanbanStore.getState().projectId !== projectId) return;
      setTasks((prev: KanbanTask[]) => {
        const updateMap = new Map(updates.map((u) => [u.id, u]));
        const currentIds = new Set(prev.map((t) => t.id));
        const updateIds = new Set(updates.map((u) => u.id));

        let changed = false;

        const merged = prev
          .map((task) => {
            const update = updateMap.get(task.id);
            if (!update) {
              changed = true;
              return task;
            }
            if (
              task.stage !== update.stage ||
              task.order !== update.order ||
              task.title !== update.title ||
              task.priority !== update.priority ||
              task.sprintId !== update.sprintId
            ) {
              changed = true;
              return { ...task, ...update };
            }
            return task;
          })
          .filter((t) => updateIds.has(t.id));

        for (const u of updates) {
          if (!currentIds.has(u.id)) {
            changed = true;
            merged.push({
              ...u,
              description: null,
              isReadyForTransition: false,
              declineCount: 0,
            } as KanbanTask);
          }
        }

        if (prev.length !== merged.length) changed = true;
        return changed ? merged : prev;
      }, projectId);
    } catch {
      // Best-effort; the next event or poll picks it up.
    }
  }, [held, projectId, setTasks]);

  /**
   * Starting a sprint fires several events at once, so hold briefly and let
   * one re-read settle the whole burst.
   */
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueResync = useCallback(() => {
    if (resyncTimer.current) return;
    const run = () => {
      resyncTimer.current = null;
      // A drag in flight would fight the patch, so wait it out rather than
      // drop the update and leave the board stale.
      if (held()) {
        resyncTimer.current = setTimeout(run, 250);
        return;
      }
      void resync();
    };
    resyncTimer.current = setTimeout(run, 250);
  }, [held, resync]);

  useEffect(
    () => () => {
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
    },
    [],
  );

  /** Patch the one task that changed instead of refetching the whole board. */
  const applyRemoteTask = useCallback(
    async (taskId: string) => {
      try {
        const updated = await getBoardTask(taskId, projectId);
        if (useKanbanStore.getState().projectId !== projectId) return;
        if (!updated) {
          useKanbanStore.getState().removeTask(taskId);
          return;
        }
        const dto = updated as unknown as KanbanTask;
        setTasks((prev: KanbanTask[]) => {
          const exists = prev.some((t) => t.id === taskId);
          return exists
            ? prev.map((t) => (t.id === taskId ? dto : t))
            : [...prev, dto];
        }, projectId);
      } catch {
        // Best-effort; the fallback poll (when realtime is off) covers gaps.
      }
    },
    [projectId, setTasks],
  );

  const handleEvent = useCallback(
    (data: unknown) => {
      const plan = planTaskSync(data, {
        currentUserId,
        dragging: Boolean(draggingRef.current?.()),
        busy: Boolean(busyRef.current?.()),
      });

      if (plan.notifySprint) sprintRef.current?.(data as ProjectSprintEvent);
      if (plan.removeTaskId && useKanbanStore.getState().projectId === projectId) {
        useKanbanStore.getState().removeTask(plan.removeTaskId);
      }
      if (plan.patchTaskId) void applyRemoteTask(plan.patchTaskId);
      if (plan.resync) queueResync();
    },
    [currentUserId, projectId, applyRemoteTask, queueResync],
  );

  useChannel(
    enabled && cent?.enabled ? projectChannel(projectId) : null,
    handleEvent,
    resync,
  );

  return { resync, applyRemoteTask };
}
