import { create } from "zustand";
import type { TaskPriorityId } from "@/lib/task-label";

/** Mirrors the Stage enum in the schema, in lifecycle order. */
export type Stage =
  | "BACKLOG"
  | "PLANNED"
  | "NEXT"
  | "TODO"
  | "IN_DEVELOPMENT"
  | "INTERNAL_REVIEW"
  | "DONE"
  | "COMPLETED"
  | "SHIPPED";

/** The subset a person can drag a card into; the rest follow the sprint. */
export type MovableStage = Extract<
  Stage,
  "BACKLOG" | "TODO" | "IN_DEVELOPMENT" | "INTERNAL_REVIEW" | "DONE"
>;
export type TaskType = "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";

export type EstimateAccuracy = "WAY_OVER" | "OVER" | "ON_TRACK" | "UNDER" | "WAY_UNDER";

export interface KanbanTask {
  id: string;
  taskNumber: number;
  title: string;
  description: string | null;
  priority: TaskPriorityId;
  taskType: TaskType;
  stage: Stage;
  order: number;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  isReadyForTransition?: boolean;
  startedAt?: string | null;
  stageEnteredAt?: string | null;
  declineCount?: number;
  estimatedMinutes?: number | null;
  estimateAccuracy?: EstimateAccuracy | null;
  notesCount?: number;
  sprintId?: string | null;
  sprintName?: string | null;
  sprintCount?: number;
}

interface KanbanState {
  projectId: string | null;
  tasks: KanbanTask[];
  commentRefreshKey: number;
  setTasks: (
    tasks: KanbanTask[] | ((prev: KanbanTask[]) => KanbanTask[]),
    forProjectId?: string,
  ) => void;
  moveTask: (taskId: string, toStage: Stage, toOrder: number) => void;
  addTask: (task: KanbanTask, forProjectId?: string) => void;
  updateTask: (taskId: string, data: Partial<KanbanTask>) => void;
  removeTask: (taskId: string) => void;
  triggerCommentRefresh: () => void;
}

export const useKanbanStore = create<KanbanState>((set) => ({
  projectId: null,
  tasks: [],
  commentRefreshKey: 0,
  setTasks: (tasks, forProjectId) =>
    set((state) => {
      // A late poll/patch from a previous project must not merge into the new one.
      if (
        forProjectId != null &&
        state.projectId != null &&
        forProjectId !== state.projectId
      ) {
        if (typeof tasks === "function") return state;
        return { projectId: forProjectId, tasks };
      }
      const next = typeof tasks === "function" ? tasks(state.tasks) : tasks;
      return {
        tasks: next,
        projectId: forProjectId ?? state.projectId,
      };
    }),

  moveTask: (taskId, toStage, toOrder) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, stage: toStage, order: toOrder } : t
      ),
    })),

  addTask: (task, forProjectId) =>
    set((state) => {
      if (forProjectId != null && state.projectId !== forProjectId) return state;
      return { tasks: [...state.tasks, task] };
    }),

  updateTask: (taskId, data) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...data } : t
      ),
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),

  triggerCommentRefresh: () =>
    set((state) => ({ commentRefreshKey: state.commentRefreshKey + 1 })),
}));
