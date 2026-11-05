"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getTasksByProject } from "@/actions/task";
import { getTaskDetailPanel } from "@/actions/task-detail-panel";
import { taskCode } from "@/lib/task-label";
import { splitChildId } from "@/next-ui/panes/pane-kinds";
import type { KanbanTask } from "@/store/kanban";

/**
 * A project's tasks (the road map and the active sprint read the same list) and one task's
 * detail, through the existing server actions. A task pane's id is `<projectId>_<taskId>`.
 * The list is typed as the board's `KanbanTask`, the way the live panel reads it.
 */

export type TaskRow = KanbanTask;
export type TaskPanel = Awaited<ReturnType<typeof getTaskDetailPanel>>;
export type TaskDetail = TaskPanel["task"];

export const projectTasksKey = (projectId: string) => ["projects", projectId, "tasks"] as const;
export const taskKey = (taskId: string) => ["tasks", taskId] as const;

export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: projectTasksKey(projectId),
    queryFn: async () => (await getTasksByProject(projectId)) as unknown as TaskRow[],
    enabled: projectId !== "",
    // the board changes under other people's hands; a fresh look each time a pane shows it
    staleTime: 5_000,
  });
}

export function useTask(taskId: string) {
  return useQuery({ queryKey: taskKey(taskId), queryFn: () => getTaskDetailPanel(taskId), enabled: taskId !== "" });
}

/** `F-012 · Title` for the breadcrumb: from the project's task list when loaded, else the task itself. */
export function useTaskLabel(paneId: string): string | undefined {
  const ids = splitChildId(paneId);
  const projectId = ids?.parent ?? "";
  const taskId = ids?.child ?? "";
  const qc = useQueryClient();
  const fromList = qc.getQueryData<TaskRow[]>(projectTasksKey(projectId))?.find((t) => t.id === taskId);
  const record = useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => getTaskDetailPanel(taskId),
    enabled: taskId !== "" && !fromList,
    select: (p) => taskLabel(p.task),
  });
  return fromList ? taskLabel(fromList) : record.data;
}

export function taskLabel(t: { taskType: string; taskNumber: number; title: string }): string {
  return `${taskCode(t.taskType, t.taskNumber)} · ${t.title}`;
}
