"use client";

import { IterationCcw } from "lucide-react";

import { stageLabel } from "@/lib/task-label";
import { useProjectTasks } from "@/next-ui/data/tasks";
import { useSprints } from "@/next-ui/data/sprints";
import { useNow } from "@/next-ui/hooks/use-now";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { Button } from "@/next-ui/ui/button";

import { activeSprint, activeSprintStages, SPRINT_STAGES, sprintDates, sprintTimeLeft, tasksOfSprint } from "./board-state";
import { Lane, LaneBoard, LaneSkeleton, TaskCard } from "./lanes";
import { messageOf } from "./roadmap-view";
import { SprintStatusMark } from "./task-marks";

/**
 * The running sprint as a board: its name, dates and time left, then its tasks by stage
 * (To do, In development, Internal review, Done). Moving a card between stages, proof of work
 * and declines are not built here yet.
 */
export function ActiveSprintView({ projectId, onOpenRoadmap }: { projectId: string; onOpenRoadmap?: () => void }) {
  const tasks = useProjectTasks(projectId);
  const sprints = useSprints(projectId);
  const now = useNow();

  if (tasks.isPending || sprints.isPending) {
    return (
      <LaneBoard>
        <LaneSkeleton rows={3} />
        <LaneSkeleton rows={2} />
        <LaneSkeleton rows={1} />
        <LaneSkeleton rows={2} />
      </LaneBoard>
    );
  }
  if (tasks.error || sprints.error || !tasks.data || !sprints.data) {
    return <EmptyState icon={IterationCcw} title="Could not load the sprint" description={messageOf(tasks.error ?? sprints.error)} />;
  }

  const sprint = activeSprint(sprints.data);
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

  const stages = activeSprintStages(tasks.data, sprint.id);
  const total = tasksOfSprint(tasks.data, sprint.id).length;
  const done = stages.DONE.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="active-sprint-head">
        <h3 className="text-sm font-medium">{sprint.name}</h3>
        <SprintStatusMark status={sprint.status} />
        <span className="text-xs text-muted-foreground">{sprintDates(sprint)}</span>
        <span className="text-xs text-muted-foreground">{sprintTimeLeft(sprint, now)}</span>
        <span className="ms-auto text-xs tabular-nums text-muted-foreground">{`${done} of ${total} done`}</span>
      </div>
      {sprint.goal && <p className="text-sm text-muted-foreground">{sprint.goal}</p>}
      <LaneBoard>
        {SPRINT_STAGES.map((stage) => (
          <Lane key={stage} title={stageLabel(stage)} status={stage} count={stages[stage].length} empty="Nothing here.">
            {stages[stage].map((t) => (
              <TaskCard key={t.id} task={t} projectId={projectId} showAssignee showEstimate />
            ))}
          </Lane>
        ))}
      </LaneBoard>
    </div>
  );
}
