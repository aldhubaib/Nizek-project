"use client";

import * as React from "react";
import { DndContext, DragOverlay, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { ChevronDown, FileText, Map, Play, Plus } from "lucide-react";

import { fieldsClearedByMove, moveNeedsReason } from "@/lib/sprint-task-move";
import type { ProjectDetail } from "@/next-ui/data/projects";
import { useProjectTasks, useReorderTasks, useScheduleTask, taskErrorText, type TaskRow } from "@/next-ui/data/tasks";
import { useEnsureSprint, useSetSprintColumn, useSprintPlanFlags, useSprints, useSprintSnapshots, type SprintDTO, type SprintSnapshotTask } from "@/next-ui/data/sprints";
import { useNow } from "@/next-ui/hooks/use-now";
import { cn } from "@/next-ui/lib/cn";
import { RecordMenu } from "@/next-ui/blocks/record-menu";
import { AppLink, childId, hrefFromEntry, usePane } from "@/next-ui/panes";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { ConfirmDialog, ErrorNote } from "@/next-ui/patterns/form-bits";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { Button } from "@/next-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/next-ui/ui/collapsible";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/next-ui/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

import { isClosedSprint, reorderedTasks, roadmapDrop, roadmapLanes, SPRINT_LANES, sprintDates, sprintLanes, sprintTimeLeft, TASK_LANES, tasksOfSprint, type RoadmapDropAction, type RoadmapDropTarget, type TaskLaneId } from "./board-state";
import { DraggableTaskCard, DropLane, Lane, LaneBoard, LaneSkeleton, laneCollision, TaskCard, useBoardSensors } from "./lanes";
import type { ViewerRights } from "./project-screen";
import { DeleteSprintDialog, ShipSprintDialog, SprintDetailsDialog } from "./sprint-dialogs";
import { NewTaskDialog } from "./task-dialogs";
import { useTaskFilter } from "./task-filter";
import { SprintStatusMark } from "./task-marks";

/**
 * The road map, the live panel's board with its moves. Four task lanes (Missing data, Backlog,
 * Planned, Next) and then the sprints as cards (In progress, Completed, Shipped), each opening
 * to its tasks. Someone who may move tasks drags a card between the lanes — into the planned
 * or next sprint (made when the lane is empty), back to the backlog (which asks before it
 * clears the plan), onto a running sprint (with a reason) — or higher and lower in a lane to
 * change its priority; a task with missing data stays put until its fields are filled. The
 * header adds a task; the Next lane's ▷ opens its sprint's document to plan and start it; each
 * sprint card opens its document (the plan, then the review), and its ⋯ holds its details,
 * shipping and deletion. The search and the Filter menu narrow the tasks on the board to one
 * type, one person's, or a title.
 */
export function RoadmapView({ project: p, rights }: { project: ProjectDetail; rights: ViewerRights }) {
  const projectId = p.id;
  const pane = usePane();
  const tasks = useProjectTasks(projectId);
  const sprints = useSprints(projectId);
  const hasClosed = (sprints.data ?? []).some((s) => isClosedSprint(s.status));
  const snapshots = useSprintSnapshots(projectId, hasClosed);
  const now = useNow();
  const filter = useTaskFilter(`roadmap:${projectId}`, tasks.data);
  const planFlags = useSprintPlanFlags(projectId, rights.canMoveTasks);

  const schedule = useScheduleTask(projectId);
  const reorder = useReorderTasks(projectId);
  const ensure = useEnsureSprint(projectId);
  const setColumn = useSetSprintColumn(projectId);
  const sensors = useBoardSensors();

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [newTask, setNewTask] = React.useState(false);
  const [ask, setAsk] = React.useState<null | { kind: "join"; task: TaskRow; sprint: SprintDTO } | { kind: "leave"; task: TaskRow; from: SprintDTO; to: SprintDTO | null; cleared: string[]; column?: "PLANNED" | "NEXT" }>(null);
  const [dialog, setDialog] = React.useState<null | { kind: "details" | "delete" | "ship"; sprint: SprintDTO }>(null);
  /** The sprint's document — one per sprint: its plan, then its review, then the record. */
  const docHref = (s: SprintDTO) => hrefFromEntry({ kind: "sprint", id: childId(projectId, s.id) });

  const tools = (
    <ListTools
      what="tasks"
      search={filter.search}
      onSearch={filter.setSearch}
      groups={filter.groups}
      action={rights.canCreateTasks && <HeaderAction label="New task" icon={<Plus />} onClick={() => setNewTask(true)} data-testid="new-task-button" />}
    />
  );

  if (tasks.isPending || sprints.isPending) {
    return (
      <>
        {tools}
        <LaneBoard>
          <LaneSkeleton rows={1} />
          <LaneSkeleton rows={4} />
          <LaneSkeleton rows={2} />
          <LaneSkeleton rows={2} />
        </LaneBoard>
      </>
    );
  }
  if (tasks.error || sprints.error || !tasks.data || !sprints.data) {
    return <EmptyState icon={Map} title="Could not load the road map" description={messageOf(tasks.error ?? sprints.error)} />;
  }

  const all = tasks.data;
  const allSprints = sprints.data;
  const shown = filter.tasks ?? all;
  const lanes = roadmapLanes(shown, allSprints);
  const bySprintLane = sprintLanes(allSprints);
  const plannedSprints = bySprintLane.PLANNED;
  const nextSprint = bySprintLane.NEXT[0] ?? null;
  const canDrag = rights.canMoveTasks;
  const active = activeId ? all.find((t) => t.id === activeId) ?? null : null;
  const sprintOf = (id: string | null | undefined) => (id ? allSprints.find((s) => s.id === id) ?? null : null);

  const fail = (err: unknown) => setNotice(taskErrorText(err));

  /** Puts the task into a sprint (a new one for an empty Planned/Next lane), asking first when the live board asks. */
  const moveIntoSprint = async (task: TaskRow, to: SprintDTO | null, column?: "PLANNED" | "NEXT", reason?: string) => {
    const from = sprintOf(task.sprintId);
    if (from && from.id !== to?.id) {
      const flags = planFlags.data?.[`${from.id}:${task.id}`];
      const cleared = fieldsClearedByMove({ fromSprintId: from.id, toSprintId: to?.id ?? null }, { hasDecision: Boolean(flags?.decision), hasRisk: Boolean(flags?.risk), hasEstimate: Boolean(task.estimatedMinutes), hasAssignee: Boolean(task.assignee) });
      const needsReason = moveNeedsReason({ fromSprintStatus: from.status, toSprintStatus: to?.status ?? null });
      if ((cleared.length > 0 || needsReason) && reason === undefined) {
        setAsk({ kind: "leave", task, from, to, cleared, column });
        return;
      }
    }
    if (to?.status === "ACTIVE" && reason === undefined) {
      setAsk({ kind: "join", task, sprint: to });
      return;
    }
    let target = to;
    if (!target && column) {
      try {
        target = await ensure.mutateAsync(column);
      } catch (err) {
        fail(err);
        return;
      }
    }
    schedule.mutate({ taskId: task.id, sprintId: target?.id ?? null, sprintName: target?.name, sprintStatus: target?.status ?? null, reason: reason?.trim() || undefined }, { onError: fail });
  };

  const perform = (task: TaskRow, action: RoadmapDropAction) => {
    switch (action.kind) {
      case "none":
        return;
      case "refuse":
        setNotice(action.reason);
        return;
      case "reorder": {
        // the lane as it really is, not as the filter shows it, so hidden tasks keep their place
        const list = roadmapLanes(all, allSprints)[action.lane];
        const moves = reorderedTasks(list, task.id, action.overTaskId).map((m) => ({ ...m, stage: list.find((t) => t.id === m.taskId)!.stage }));
        if (moves.length > 0) reorder.mutate(moves, { onError: fail });
        return;
      }
      case "unschedule":
        void moveIntoSprint(task, null);
        return;
      case "schedule":
        void moveIntoSprint(task, sprintOf(action.sprintId), action.column);
        return;
      case "into-sprint":
        void moveIntoSprint(task, sprintOf(action.sprintId));
        return;
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const task = all.find((t) => t.id === e.active.data.current?.taskId);
    const overData = e.over?.data.current as (RoadmapDropTarget & Record<string, unknown>) | undefined;
    if (!task || !overData) return;
    const target: RoadmapDropTarget = overData.kind === "task" ? { kind: "task", lane: overData.lane, taskId: overData.taskId as string } : overData.kind === "sprint" ? { kind: "sprint", sprintId: overData.sprintId, status: overData.status } : { kind: "lane", lane: overData.lane };
    const action = roadmapDrop(task, target, { planned: new Set(plannedSprints.map((s) => s.id)), next: nextSprint?.id ?? null, firstPlanned: plannedSprints[0]?.id ?? null });
    setNotice(null);
    perform(task, action);
  };

  const laneMenu = (lane: TaskLaneId) => {
    if (lane === "planned" && plannedSprints.length > 0 && (rights.canPlanTasks || rights.canDeleteSprints)) {
      return (
        <RecordMenu label="Planned sprints" contentClassName="min-w-56">
          {plannedSprints.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <DropdownMenuSeparator />}
              <SprintMenuItems sprint={s} rights={rights} canGoNext={!nextSprint} onDocument={() => pane.navigate(docHref(s))} onDetails={() => setDialog({ kind: "details", sprint: s })} onColumn={(column) => setColumn.mutate({ sprintId: s.id, column }, { onError: fail })} onDelete={() => setDialog({ kind: "delete", sprint: s })} />
            </React.Fragment>
          ))}
        </RecordMenu>
      );
    }
    if (lane === "next" && nextSprint) {
      const canPlan = (rights.canStartSprints || rights.canCreateSprints || rights.canPlanTasks) && rights.projectActive;
      return (
        <span className="flex items-center">
          {canPlan && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" asChild data-testid="plan-sprint-button">
                  <AppLink href={docHref(nextSprint)} aria-label="Plan and start sprint">
                    <Play />
                  </AppLink>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Plan and start sprint</TooltipContent>
            </Tooltip>
          )}
          {(rights.canPlanTasks || rights.canDeleteSprints) && (
            <RecordMenu label="Sprint options" contentClassName="min-w-48">
              <SprintMenuItems sprint={nextSprint} rights={rights} canGoPlanned onDocument={() => pane.navigate(docHref(nextSprint))} onDetails={() => setDialog({ kind: "details", sprint: nextSprint })} onColumn={(column) => setColumn.mutate({ sprintId: nextSprint.id, column }, { onError: fail })} onDelete={() => setDialog({ kind: "delete", sprint: nextSprint })} />
            </RecordMenu>
          )}
        </span>
      );
    }
    return undefined;
  };

  const board = (
    <LaneBoard>
      {TASK_LANES.map((lane) => (
        <DropLane key={lane.id} id={`lane:${lane.id}`} data={{ kind: "lane", lane: lane.id }} disabled={!canDrag || lane.id === "missing"} title={lane.label} status={lane.status} count={lanes[lane.id].length} empty={lane.empty} action={laneMenu(lane.id)}>
          {lanes[lane.id].map((t) => (
            <DraggableTaskCard key={t.id} task={t} projectId={projectId} data={{ kind: "task", lane: lane.id }} disabled={!canDrag} active={activeId} />
          ))}
        </DropLane>
      ))}
      {SPRINT_LANES.map((lane) => (
        <Lane key={lane.id} title={lane.label} status={lane.status} count={bySprintLane[lane.id].length} empty={lane.empty}>
          {bySprintLane[lane.id].map((s) => (
            <SprintCard
              key={s.id}
              sprint={s}
              projectId={projectId}
              now={now}
              tasks={shown}
              snapshot={snapshots.data?.[s.id]}
              defaultOpen={s.status === "ACTIVE"}
              canDrop={canDrag && !isClosedSprint(s.status)}
              activeId={activeId}
              docHref={docHref(s)}
              menu={
                (rights.canEndSprints || rights.canPlanTasks || rights.canDeleteSprints) && (
                  <RecordMenu label="Sprint options" contentClassName="min-w-48">
                    {s.status === "ACTIVE" && rights.canEndSprints && (
                      <DropdownMenuItem onSelect={() => pane.navigate(docHref(s))} data-testid="end-sprint-item">
                        Review and end sprint
                      </DropdownMenuItem>
                    )}
                    {s.status === "ACTIVE" && rights.canPlanTasks && <DropdownMenuItem onSelect={() => setDialog({ kind: "details", sprint: s })}>Sprint details</DropdownMenuItem>}
                    {(s.status === "COMPLETED" || s.status === "PARTIALLY_COMPLETED") && rights.canDeleteSprints && rights.projectActive && <DropdownMenuItem onSelect={() => setDialog({ kind: "ship", sprint: s })}>Mark as shipped</DropdownMenuItem>}
                    {s.status === "SHIPPED" && rights.canDeleteSprints && rights.projectActive && <DropdownMenuItem onSelect={() => setColumn.mutate({ sprintId: s.id, column: "COMPLETED" }, { onError: fail })}>Back to Completed</DropdownMenuItem>}
                    {rights.canDeleteSprints && rights.projectActive && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete", sprint: s })}>
                          Delete sprint
                        </DropdownMenuItem>
                      </>
                    )}
                  </RecordMenu>
                )
              }
            />
          ))}
        </Lane>
      ))}
    </LaneBoard>
  );

  return (
    <>
      {tools}
      {notice && (
        <ErrorNote className="mb-3" onClose={() => setNotice(null)}>
          {notice}
        </ErrorNote>
      )}
      <DndContext sensors={sensors} collisionDetection={laneCollision} onDragStart={(e) => setActiveId(String(e.active.data.current?.taskId ?? ""))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
        {board}
        <DragOverlay dropAnimation={null}>{active ? <TaskCard task={active} projectId={projectId} ghost showAssignee /> : null}</DragOverlay>
      </DndContext>

      <NewTaskDialog project={p} rights={rights} open={newTask} onClose={() => setNewTask(false)} />
      <ConfirmDialog
        open={ask?.kind === "join"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "join" ? `Add to ${ask.sprint.name}` : ""}
        description={ask?.kind === "join" ? `"${ask.task.title}" joins a sprint that is already running. The sprint document records it as unplanned work, with your reason.` : undefined}
        confirmLabel="Add to sprint"
        busyLabel="Adding…"
        reason={{ label: "Why it is added now", placeholder: "A client request, a blocker, a fix that cannot wait…" }}
        onConfirm={({ reason }) => (ask?.kind === "join" ? moveIntoSprint(ask.task, ask.sprint, undefined, reason) : undefined)}
        testId="join-sprint-dialog"
      />
      <ConfirmDialog
        open={ask?.kind === "leave"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "leave" ? (ask.to ? `Move to ${ask.to.name}` : "Back to the backlog") : ""}
        description={ask?.kind === "leave" ? leaveText(ask) : undefined}
        confirmLabel={ask?.kind === "leave" && ask.to ? "Move task" : "Remove from sprint"}
        busyLabel="Moving…"
        destructive={ask?.kind === "leave" && ask.cleared.length > 0}
        reason={ask?.kind === "leave" && moveNeedsReason({ fromSprintStatus: ask.from.status, toSprintStatus: ask.to?.status ?? null }) ? { label: "Why it leaves the running sprint" } : undefined}
        onConfirm={({ reason }) => (ask?.kind === "leave" ? moveIntoSprint(ask.task, ask.to, ask.column, reason) : undefined)}
        testId="leave-sprint-dialog"
      />
      <SprintDetailsDialog projectId={projectId} sprint={dialog?.kind === "details" ? dialog.sprint : null} open={dialog?.kind === "details"} onClose={() => setDialog(null)} />
      <DeleteSprintDialog projectId={projectId} sprint={dialog?.kind === "delete" ? dialog.sprint : null} open={dialog?.kind === "delete"} onClose={() => setDialog(null)} />
      <ShipSprintDialog projectId={projectId} sprint={dialog?.kind === "ship" ? dialog.sprint : null} open={dialog?.kind === "ship"} onClose={() => setDialog(null)} />
    </>
  );
}

function leaveText(ask: { task: TaskRow; from: SprintDTO; to: SprintDTO | null; cleared: string[] }): string {
  const where = ask.to ? `"${ask.to.name}"` : "the backlog";
  const head = `"${ask.task.title}" leaves "${ask.from.name}" for ${where}.`;
  if (ask.cleared.length === 0) return head;
  const list = ask.cleared.length === 1 ? ask.cleared[0] : `${ask.cleared.slice(0, -1).join(", ")} and ${ask.cleared[ask.cleared.length - 1]}`;
  return `${head} Its ${list} ${ask.cleared.length === 1 ? "is" : "are"} cleared.`;
}

/** The items a planned or next sprint's menu holds: its document, details, the other column, delete. */
function SprintMenuItems({ sprint, rights, canGoNext, canGoPlanned, onDocument, onDetails, onColumn, onDelete }: { sprint: SprintDTO; rights: ViewerRights; canGoNext?: boolean; canGoPlanned?: boolean; onDocument: () => void; onDetails: () => void; onColumn: (column: "PLANNED" | "NEXT") => void; onDelete: () => void }) {
  return (
    <>
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{sprint.name}</div>
      <DropdownMenuItem onSelect={onDocument}>Sprint document</DropdownMenuItem>
      {rights.canPlanTasks && <DropdownMenuItem onSelect={onDetails}>Sprint details</DropdownMenuItem>}
      {rights.canPlanTasks && canGoNext && <DropdownMenuItem onSelect={() => onColumn("NEXT")}>Move to Next</DropdownMenuItem>}
      {rights.canPlanTasks && canGoPlanned && <DropdownMenuItem onSelect={() => onColumn("PLANNED")}>Back to Planned</DropdownMenuItem>}
      {rights.canDeleteSprints && rights.projectActive && (
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete sprint
        </DropdownMenuItem>
      )}
    </>
  );
}

/**
 * A sprint in its lane: name, status, dates and task count, opening to the tasks it holds, with
 * its document a click away. A finished sprint shows what it looked like when it ended (its
 * snapshot) when that has loaded. An open sprint takes dropped cards.
 */
function SprintCard({
  sprint,
  projectId,
  now,
  tasks,
  snapshot,
  defaultOpen,
  canDrop,
  activeId,
  docHref,
  menu,
}: {
  sprint: SprintDTO;
  projectId: string;
  now: Date;
  tasks: TaskRow[];
  snapshot?: SprintSnapshotTask[];
  defaultOpen?: boolean;
  canDrop?: boolean;
  activeId?: string | null;
  /** The sprint's document: its plan, its review, the record once it has closed. */
  docHref: string;
  menu?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  const closed = isClosedSprint(sprint.status);
  const live = tasksOfSprint(tasks, sprint.id);
  const rows = closed && snapshot ? snapshot : null;
  const count = rows ? rows.length : live.length;
  return (
    <SprintDropZone sprint={sprint} disabled={!canDrop}>
      {(over) => (
        <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-lg border bg-card transition-colors", over && "border-ring/60 bg-muted/40")} data-testid="sprint-card">
          <div className="flex items-start">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{sprint.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <SprintStatusMark status={sprint.status} />
                    <span>{sprintDates(sprint)}</span>
                    {sprint.status === "ACTIVE" && <span>{sprintTimeLeft(sprint, now)}</span>}
                  </span>
                </div>
                <span className="flex shrink-0 items-center gap-1 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {`${count} ${count === 1 ? "task" : "tasks"}`}
                  <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                </span>
              </button>
            </CollapsibleTrigger>
            <span className="flex items-center py-1.5 pe-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" asChild data-testid="sprint-doc-link">
                    <AppLink href={docHref} aria-label={`${sprint.name} document`}>
                      <FileText />
                    </AppLink>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sprint document</TooltipContent>
              </Tooltip>
              {menu}
            </span>
          </div>
          <CollapsibleContent>
            <div className="flex flex-col gap-2 border-t p-2">
              {sprint.goal && <p className="px-1 text-xs text-muted-foreground">{sprint.goal}</p>}
              {count === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">{canDrop ? "Drop tasks here to add them to this sprint." : "No tasks recorded for this sprint."}</p>
              ) : rows ? (
                rows.map((r) => (
                  <TaskCard
                    key={r.id}
                    projectId={projectId}
                    task={{
                      id: r.taskId,
                      title: r.title,
                      taskNumber: r.taskNumber,
                      taskType: r.taskType,
                      stage: r.stage,
                      order: 0,
                      priority: r.priority,
                      sprintId: sprint.id,
                      isReadyForTransition: true,
                      assignee: r.assignee,
                      estimatedMinutes: r.estimatedMinutes,
                    }}
                    muted={r.stage !== "DONE"}
                    showAssignee
                  />
                ))
              ) : (
                live.map((t) =>
                  canDrop ? (
                    <DraggableTaskCard key={t.id} task={t} projectId={projectId} data={{ kind: "sprint", sprintId: sprint.id, status: sprint.status }} active={activeId} showAssignee />
                  ) : (
                    <TaskCard key={t.id} task={t} projectId={projectId} showAssignee muted={closed && t.stage !== "DONE"} />
                  ),
                )
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </SprintDropZone>
  );
}

function SprintDropZone({ sprint, disabled, children }: { sprint: SprintDTO; disabled: boolean; children: (over: boolean) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sprint:${sprint.id}`, data: { kind: "sprint", sprintId: sprint.id, status: sprint.status }, disabled });
  return <div ref={setNodeRef}>{children(isOver && !disabled)}</div>;
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : err ? String(err) : "Please try again.";
}
