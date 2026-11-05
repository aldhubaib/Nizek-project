"use client";

import * as React from "react";
import { ChevronDown, Map } from "lucide-react";

import { useNow } from "@/next-ui/hooks/use-now";
import { cn } from "@/next-ui/lib/cn";
import { useProjectTasks, type TaskRow } from "@/next-ui/data/tasks";
import { useSprints, useSprintSnapshots, type SprintDTO, type SprintSnapshotTask } from "@/next-ui/data/sprints";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/next-ui/ui/collapsible";

import {
  isClosedSprint,
  roadmapLanes,
  SPRINT_LANES,
  sprintDates,
  sprintLanes,
  sprintTimeLeft,
  TASK_LANES,
  tasksOfSprint,
} from "./board-state";
import { Lane, LaneBoard, LaneSkeleton, TaskCard } from "./lanes";
import { SprintStatusMark } from "./task-marks";

/**
 * The road map: the live panel's board, read here. Four task lanes (Missing data, Backlog,
 * Planned, Next) and then the sprints as cards (In progress, Completed, Shipped), each
 * opening to its tasks. Moving tasks, starting a sprint and the sprint review are not built
 * here yet.
 */
export function RoadmapView({ projectId }: { projectId: string }) {
  const tasks = useProjectTasks(projectId);
  const sprints = useSprints(projectId);
  const hasClosed = (sprints.data ?? []).some((s) => isClosedSprint(s.status));
  const snapshots = useSprintSnapshots(projectId, hasClosed);
  const now = useNow();

  if (tasks.isPending || sprints.isPending) {
    return (
      <LaneBoard>
        <LaneSkeleton rows={1} />
        <LaneSkeleton rows={4} />
        <LaneSkeleton rows={2} />
        <LaneSkeleton rows={2} />
      </LaneBoard>
    );
  }
  if (tasks.error || sprints.error || !tasks.data || !sprints.data) {
    return <EmptyState icon={Map} title="Could not load the road map" description={messageOf(tasks.error ?? sprints.error)} />;
  }

  const lanes = roadmapLanes(tasks.data, sprints.data);
  const bySprintLane = sprintLanes(sprints.data);

  return (
    <LaneBoard>
      {TASK_LANES.map((lane) => (
        <Lane key={lane.id} title={lane.label} status={lane.status} count={lanes[lane.id].length} empty={lane.empty}>
          {lanes[lane.id].map((t) => (
            <TaskCard key={t.id} task={t} projectId={projectId} />
          ))}
        </Lane>
      ))}
      {SPRINT_LANES.map((lane) => (
        <Lane key={lane.id} title={lane.label} status={lane.status} count={bySprintLane[lane.id].length} empty={lane.empty}>
          {bySprintLane[lane.id].map((s) => (
            <SprintCard
              key={s.id}
              sprint={s}
              projectId={projectId}
              now={now}
              tasks={tasks.data}
              snapshot={snapshots.data?.[s.id]}
              defaultOpen={s.status === "ACTIVE"}
            />
          ))}
        </Lane>
      ))}
    </LaneBoard>
  );
}

/**
 * A sprint in its lane: name, status, dates and task count, opening to the tasks it holds. A
 * finished sprint shows what it looked like when it ended (its snapshot) when that has loaded.
 */
function SprintCard({
  sprint,
  projectId,
  now,
  tasks,
  snapshot,
  defaultOpen,
}: {
  sprint: SprintDTO;
  projectId: string;
  now: Date;
  tasks: TaskRow[];
  snapshot?: SprintSnapshotTask[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  const closed = isClosedSprint(sprint.status);
  const live = tasksOfSprint(tasks, sprint.id);
  const rows = closed && snapshot ? snapshot : null;
  const count = rows ? rows.length : live.length;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card" data-testid="sprint-card">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-start gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
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
      <CollapsibleContent>
        <div className="flex flex-col gap-2 border-t p-2">
          {sprint.goal && <p className="px-1 text-xs text-muted-foreground">{sprint.goal}</p>}
          {count === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No tasks recorded for this sprint.</p>
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
            live.map((t) => <TaskCard key={t.id} task={t} projectId={projectId} showAssignee muted={closed && t.stage !== "DONE"} />)
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : err ? String(err) : "Please try again.";
}
