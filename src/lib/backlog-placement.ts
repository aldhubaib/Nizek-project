"use client";

import { moveTask } from "@/actions/task";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";

function nextBacklogOrder(tasks: KanbanTask[], excludeId: string): number {
  const backlog = tasks.filter(
    (t) =>
      t.id !== excludeId &&
      !t.sprintId &&
      t.stage !== "DONE" &&
      (t.stage !== "NEW_REQUEST" || t.isReadyForTransition),
  );
  return backlog.reduce((max, t) => Math.max(max, t.order), -1) + 1;
}

/** Send a newly completed unassigned task to the bottom of the Backlog list. */
export function promoteToBacklogBottom(taskId: string) {
  const { tasks, updateTask } = useKanbanStore.getState();
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.sprintId || task.stage === "DONE") {
    if (task) updateTask(taskId, { isReadyForTransition: true });
    return;
  }
  const order = nextBacklogOrder(tasks, taskId);
  updateTask(taskId, { isReadyForTransition: true, order });
  if (task.order !== order) {
    void moveTask({ taskId, stage: task.stage, order });
  }
}

/** When a task becomes complete, send it to the bottom of the Backlog list. */
export function syncTaskReadiness(taskId: string, isReady: boolean) {
  const { tasks, updateTask } = useKanbanStore.getState();
  const task = tasks.find((t) => t.id === taskId);
  const wasReady = Boolean(task?.isReadyForTransition);

  if (!task) {
    updateTask(taskId, { isReadyForTransition: isReady });
    return;
  }

  if (isReady && !wasReady && !task.sprintId && task.stage !== "DONE") {
    promoteToBacklogBottom(taskId);
    return;
  }

  updateTask(taskId, { isReadyForTransition: isReady });
}
