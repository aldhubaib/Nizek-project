"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, MoreHorizontal, Search } from "lucide-react";
import { SprintStatusControl } from "@/components/project/sprint-status-control";
import { EstimateBadge, SprintTaskRow, TaskTypeCountSummary } from "@/components/project/sprint-task-row";
import { deleteSprint, getSprintSnapshots, type SprintDTO, type SprintSnapshotTask } from "@/actions/sprint";
import { CollapsibleSection } from "@/components/project/collapsible-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/equity/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { isClosedSprint } from "@/lib/sprint-status";
import { cn } from "@/lib/utils";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { NoteFullScreenCreate } from "@/components/project/note-full-screen-create";

interface Props {
  projectId: string;
  sprints: SprintDTO[];
  onSprintsChange: Dispatch<SetStateAction<SprintDTO[]>>;
  initialTasks: KanbanTask[];
  canManage: boolean;
  isProjectActive: boolean;
}

export function CompletedSprintsTab({
  projectId,
  sprints,
  onSprintsChange,
  initialTasks,
  canManage,
  isProjectActive,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<SprintDTO | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [snapshots, setSnapshots] = useState<Record<string, SprintSnapshotTask[]> | null>(null);
  const storeTasks = useKanbanStore((s) => s.tasks);
  const updateTask = useKanbanStore((s) => s.updateTask);
  const liveTasks = storeTasks.length > 0 ? storeTasks : initialTasks;
  const [reviewSprint, setReviewSprint] = useState<SprintDTO | null>(null);
  const closeReview = useCallback(() => {
    setReviewSprint(null);
    router.refresh();
  }, [router]);

  const completed = useMemo(
    () =>
      sprints
        .filter((s) => isClosedSprint(s.status))
        .slice()
        .sort((a, b) => {
          const aAt = new Date(a.completedAt ?? a.updatedAt ?? a.endDate).getTime();
          const bAt = new Date(b.completedAt ?? b.updatedAt ?? b.endDate).getTime();
          return bAt - aAt;
        }),
    [sprints],
  );

  useEffect(() => {
    if (completed.length > 0 && snapshots === null) {
      getSprintSnapshots(projectId).then(setSnapshots);
    }
  }, [completed.length, projectId, snapshots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return completed;
    return completed.filter(
      (sprint) =>
        sprint.name.toLowerCase().includes(q) ||
        (sprint.incompleteReason ?? "").toLowerCase().includes(q),
    );
  }, [completed, query]);

  function tasksForSprint(sprintId: string): SprintSnapshotTask[] {
    if (snapshots && snapshots[sprintId]) {
      return snapshots[sprintId];
    }
    return liveTasks
      .filter((t) => t.sprintId === sprintId)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t.id,
        taskId: t.id,
        title: t.title,
        taskNumber: t.taskNumber,
        taskType: t.taskType,
        stage: t.stage,
        estimatedMinutes: t.estimatedMinutes ?? null,
        incompleteReason: null,
        assignee: t.assignee ?? null,
      }));
  }

  async function confirmDelete(typed: string) {
    const sprint = deletingSprint;
    if (!sprint) return;
    setError(null);
    await deleteSprint(sprint.id, typed);
    for (const task of useKanbanStore.getState().tasks) {
      if (task.sprintId === sprint.id) {
        updateTask(task.id, { sprintId: null, sprintName: null, assignee: null });
      }
    }
    onSprintsChange((prev) => prev.filter((s) => s.id !== sprint.id));
    setSnapshots((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[sprint.id];
      return next;
    });
    router.refresh();
  }

  if (completed.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-s text-muted-foreground">No completed sprints</p>
        <p className="text-xs text-muted-foreground">
          Complete a sprint from the Backlog to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search completed sprints"
          className="pl-8"
          aria-label="Search completed sprints"
        />
      </div>

      {error ? <p className="text-s text-destructive">{error}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-8">
        {filtered.length === 0 ? (
          <p className="px-2 py-10 text-center text-s text-muted-foreground">
            No sprints match "{query.trim()}".
          </p>
        ) : (
          filtered.map((sprint) => {
            const items = tasksForSprint(sprint.id);
            const isCollapsed = collapsed[sprint.id] ?? true;

            const typeSummary = <TaskTypeCountSummary tasks={items} />;

            return (
              <CollapsibleSection
                key={sprint.id}
                title={sprint.name}
                extra={typeSummary}
                collapsed={isCollapsed}
                onToggle={() =>
                  setCollapsed((c) => ({ ...c, [sprint.id]: !isCollapsed }))
                }
                actions={
                  <>
                    <SprintStatusControl
                      status={sprint.status}
                      endDate={sprint.endDate}
                    />
                    <button
                      type="button"
                      aria-label={`Open sprint review for ${sprint.name}`}
                      title="Sprint review"
                      onClick={() => setReviewSprint(sprint)}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ClipboardCheck className="size-4" />
                    </button>
                    {canManage && isProjectActive ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Sprint options"
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeletingSprint(sprint)}
                        >
                          Delete sprint
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    ) : null}
                  </>
                }
              >
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    No tasks recorded for this sprint.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {items.map((task) => (
                      <div key={task.id} className="space-y-1.5">
                        <SprintTaskRow
                          task={task}
                          missingData={false}
                          extra={
                            task.estimatedMinutes != null && task.estimatedMinutes > 0 ? (
                              <EstimateBadge minutes={task.estimatedMinutes} />
                            ) : null
                          }
                          onClick={() =>
                            router.push(`/dashboard/projects/${projectId}/tasks/${task.taskId}`)
                          }
                        />
                        {task.incompleteReason ? (
                          <p className="rounded-lg border border-border/60 bg-surface/60 px-3 py-2 text-s leading-relaxed text-muted-foreground">
                            <span className="mb-0.5 block text-xs font-medium uppercase tracking-wider">
                              Incomplete because
                            </span>
                            <span className="text-foreground">{task.incompleteReason}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            );
          })
        )}
      </div>
    {deletingSprint ? (
      <ConfirmDeleteDialog
        key={deletingSprint.id}
        open
        onOpenChange={(open) => {
          if (!open) setDeletingSprint(null);
        }}
        title={`Delete ${deletingSprint.name}?`}
        description="This cannot be undone. The sprint record and its snapshots will be removed."
        confirmWord={deletingSprint.name}
        confirmLabel="Delete sprint"
        onConfirm={confirmDelete}
      />
    ) : null}
    {reviewSprint ? (
      <NoteSlideOver
        title={`${reviewSprint.name} review`}
        onClose={closeReview}
      >
        <NoteFullScreenCreate
          projectId={projectId}
          createTypes={["SPRINT_REVIEW"]}
          initialTitle={`${reviewSprint.name} review`}
          sprintId={reviewSprint.id}
          onCancel={closeReview}
          saveInHeader={false}
          onCreated={() => {}}
        />
      </NoteSlideOver>
    ) : null}
    </div>
  );
}
