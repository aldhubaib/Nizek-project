"use client";

import * as React from "react";
import { DndContext, DragOverlay, type DragEndEvent } from "@dnd-kit/core";
import { ArrowRight, Flag, IterationCcw, Undo2 } from "lucide-react";

import { stageLabel } from "@/lib/task-label";
import type { ProjectDetail } from "@/next-ui/data/projects";
import { useProjectTasks, type TaskRow } from "@/next-ui/data/tasks";
import { useSprints } from "@/next-ui/data/sprints";
import { useNow } from "@/next-ui/hooks/use-now";
import { RecordMenu } from "@/next-ui/blocks/record-menu";
import { childId, hrefFromEntry, usePane } from "@/next-ui/panes";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { ErrorNote } from "@/next-ui/patterns/form-bits";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { Button } from "@/next-ui/ui/button";
import { DropdownMenuItem } from "@/next-ui/ui/dropdown-menu";

import { activeSprint, activeSprintStages, isValidSprintMove, SPRINT_STAGES, sprintDates, sprintStageMoves, sprintTimeLeft, tasksOfSprint } from "./board-state";
import { DraggableTaskCard, DropLane, LaneBoard, LaneSkeleton, laneCollision, TaskCard, useBoardSensors } from "./lanes";
import type { ViewerRights } from "./project-screen";
import { messageOf } from "./roadmap-view";
import { useTaskFilter } from "./task-filter";
import { SprintStatusMark } from "./task-marks";
import { useStageMove } from "./use-stage-move";

/**
 * The running sprint as a board: its name, dates and time left, then its tasks by stage (To
 * do, In development, Internal review, Done). Someone who may move tasks drags a card one
 * stage forward, from review straight to Done, or back from review to development (a decline,
 * with a reason) — the same moves the card's ⋯ offers — and the live board's checkpoints
 * apply: an estimate before development, the proof video before review as the project's video
 * rule says, a word of approval before Done. The header's flag opens the sprint's document,
 * where the sprint is reviewed and ended. The search and the Filter menu narrow the tasks to
 * one type, one person's, or a title; the "done" count stays the sprint's own.
 */
export function ActiveSprintView({ project: p, rights, onOpenRoadmap }: { project: ProjectDetail; rights: ViewerRights; onOpenRoadmap?: () => void }) {
  const projectId = p.id;
  const pane = usePane();
  const tasks = useProjectTasks(projectId);
  const sprints = useSprints(projectId);
  const now = useNow();
  const sprint = sprints.data ? activeSprint(sprints.data) : null;
  const own = sprint && tasks.data ? tasksOfSprint(tasks.data, sprint.id) : undefined;
  const filter = useTaskFilter(`sprint:${projectId}`, own);
  const stageMove = useStageMove(projectId, rights);
  const sensors = useBoardSensors();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const canDrag = rights.canMoveTasks;
  const openDoc = () => sprint && pane.navigate(hrefFromEntry({ kind: "sprint", id: childId(projectId, sprint.id) }));

  const tools = (
    <ListTools
      what="tasks"
      search={filter.search}
      onSearch={filter.setSearch}
      groups={filter.groups}
      action={sprint && <HeaderAction label={rights.canEndSprints ? "Review and end sprint" : "Sprint document"} icon={<Flag />} onClick={openDoc} data-testid="end-sprint-button" />}
    />
  );

  if (tasks.isPending || sprints.isPending) {
    return (
      <>
        {tools}
        <LaneBoard>
          <LaneSkeleton rows={3} />
          <LaneSkeleton rows={2} />
          <LaneSkeleton rows={1} />
          <LaneSkeleton rows={2} />
        </LaneBoard>
      </>
    );
  }
  if (tasks.error || sprints.error || !tasks.data || !sprints.data) {
    return <EmptyState icon={IterationCcw} title="Could not load the sprint" description={messageOf(tasks.error ?? sprints.error)} />;
  }

  if (!sprint) {
    return (
      <EmptyState
        icon={IterationCcw}
        title="No active sprint"
        description="Start a sprint from the road map to see it here."
        action={
          onOpenRoadmap && (
            <Button variant="outline" size="sm" onClick={onOpenRoadmap}>
              Go to road map
            </Button>
          )
        }
      />
    );
  }

  const all = activeSprintStages(tasks.data, sprint.id);
  const stages = filter.isFiltered ? activeSprintStages(filter.tasks ?? [], sprint.id) : all;
  const total = own?.length ?? 0;
  const done = all.DONE.length;
  const active = activeId ? own?.find((t) => t.id === activeId) ?? null : null;

  /** The end of the target column, as the live board places a dropped card. */
  const moveTo = (task: TaskRow, to: string) => stageMove.request(task, to, all[to as keyof typeof all]?.length ?? 0);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const task = own?.find((t) => t.id === e.active.data.current?.taskId);
    const to = e.over?.data.current?.stage as string | undefined;
    if (!task || !to) return;
    const from = SPRINT_STAGES.includes(task.stage as (typeof SPRINT_STAGES)[number]) ? task.stage : "TODO";
    if (!isValidSprintMove(from, to)) return;
    moveTo(task, to);
  };

  return (
    <div className="flex flex-col gap-4">
      {tools}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="active-sprint-head">
        <h3 className="text-sm font-medium">{sprint.name}</h3>
        <SprintStatusMark status={sprint.status} />
        <span className="text-xs text-muted-foreground">{sprintDates(sprint)}</span>
        <span className="text-xs text-muted-foreground">{sprintTimeLeft(sprint, now)}</span>
        <span className="ms-auto text-xs tabular-nums text-muted-foreground">{`${done} of ${total} done`}</span>
      </div>
      {sprint.goal && <p className="text-sm text-muted-foreground">{sprint.goal}</p>}
      {stageMove.notice && <ErrorNote onClose={stageMove.clearNotice}>{stageMove.notice}</ErrorNote>}
      <DndContext sensors={sensors} collisionDetection={laneCollision} onDragStart={(e) => setActiveId(String(e.active.data.current?.taskId ?? ""))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
        <LaneBoard>
          {SPRINT_STAGES.map((stage) => (
            <DropLane key={stage} id={`stage:${stage}`} data={{ kind: "stage", stage }} disabled={!canDrag} title={stageLabel(stage)} status={stage} count={stages[stage].length} empty="Nothing here.">
              {stages[stage].map((t) => (
                <DraggableTaskCard
                  key={t.id}
                  task={t}
                  projectId={projectId}
                  data={{ kind: "stage", stage }}
                  disabled={!canDrag}
                  active={activeId}
                  showAssignee
                  showEstimate
                  menu={
                    canDrag && sprintStageMoves(stage).length > 0 ? (
                      <RecordMenu label="Move task" contentClassName="min-w-52">
                        {sprintStageMoves(stage).map((m) => (
                          <DropdownMenuItem key={m.to} onSelect={() => moveTo(t, m.to)} variant={m.decline ? "destructive" : undefined} data-testid={`move-to-${m.to}`}>
                            {m.decline ? <Undo2 /> : <ArrowRight />}
                            {m.decline ? "Send back to development" : `Move to ${stageLabel(m.to)}`}
                          </DropdownMenuItem>
                        ))}
                      </RecordMenu>
                    ) : undefined
                  }
                />
              ))}
            </DropLane>
          ))}
        </LaneBoard>
        <DragOverlay dropAnimation={null}>{active ? <TaskCard task={active} projectId={projectId} ghost showAssignee showEstimate /> : null}</DragOverlay>
      </DndContext>
      {stageMove.dialogs}
    </div>
  );
}
