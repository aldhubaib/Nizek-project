"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/kanban/board-lazy";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { promoteActiveSprintTasks, type SprintDTO } from "@/actions/sprint";
import { SprintStatusControl } from "@/components/project/sprint-status-control";
import { BypassRequestsPopover } from "@/components/project/bypass-requests-popover";
import type { UserPermissions } from "@/app/(dashboard)/dashboard/projects/[projectId]/project-detail-client";
import type { TaskQuestion } from "@/components/kanban/question-field";

interface Props {
  projectId: string;
  sprints: SprintDTO[];
  onSprintsChange: Dispatch<SetStateAction<SprintDTO[]>>;
  tasks: KanbanTask[];
  userRole: string;
  userPermissions: UserPermissions;
  isActive: boolean;
  questions: (TaskQuestion & { taskType: string })[];
  currentUserId: string;
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
  canManage: boolean;
  onOpenBacklog?: () => void;
}

export function SprintsTab({
  projectId,
  sprints,
  tasks,
  userRole,
  userPermissions,
  isActive,
  questions,
  currentUserId,
  allowedTaskTypes,
  activeContractType,
  onOpenBacklog,
}: Props) {
  const updateTask = useKanbanStore((s) => s.updateTask);
  const setTasks = useKanbanStore((s) => s.setTasks);

  const active = sprints.find((s) => s.status === "ACTIVE") ?? null;
  const activeId = active?.id ?? "";

  useEffect(() => {
    if (!activeId) return;
    const backlog = (stage: string) => stage === "BACKLOG" || stage === "CLARIFICATION";
    const store = useKanbanStore.getState();
    if (store.projectId != null && store.projectId !== projectId) {
      setTasks(tasks, projectId);
    }
    const current = useKanbanStore.getState().tasks;
    if (current.length === 0) {
      if (!tasks.some((task) => task.sprintId === activeId && backlog(task.stage))) return;
      setTasks(
        tasks.map((task) =>
          task.sprintId === activeId && backlog(task.stage)
            ? { ...task, stage: "TODO" }
            : task,
        ),
        projectId,
      );
    } else {
      let changed = false;
      for (const task of current) {
        if (task.sprintId === activeId && backlog(task.stage)) {
          updateTask(task.id, { stage: "TODO" });
          changed = true;
        }
      }
      if (!changed) return;
    }
    void promoteActiveSprintTasks(activeId);
  }, [activeId, projectId, tasks, setTasks, updateTask]);

  if (!active) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex items-center">
          <BypassRequestsPopover projectId={projectId} currentUserId={currentUserId} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-s text-muted-foreground">No active sprint</p>
          <p className="text-xs text-muted-foreground">
            Start a sprint from the Road map to see it here.
          </p>
          {onOpenBacklog && (
            <Button size="sm" variant="outline" className="mt-2" onClick={onOpenBacklog}>
              Go to Road map
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <h2 className="min-w-0 text-s font-semibold">
          {active.name} ({tasks.filter((t) => t.sprintId === active.id).length})
        </h2>
        <SprintStatusControl status={active.status} endDate={active.endDate} />
        <BypassRequestsPopover projectId={projectId} currentUserId={currentUserId} />
      </div>

      <div className="relative min-h-[calc(100dvh-8.75rem)] min-w-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
        <KanbanBoard
          initialTasks={tasks}
          projectId={projectId}
          userRole={userRole}
          userPermissions={userPermissions}
          isProjectActive={isActive}
          questions={questions}
          currentUserId={currentUserId}
          allowedTaskTypes={allowedTaskTypes}
          activeContractType={activeContractType}
          filterSprintId={active.id}
          pipelineOnly
          readOnly={!isActive}
        />
        </div>
      </div>
    </div>
  );
}
