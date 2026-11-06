"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createComment, deleteComment, getComments } from "@/actions/comment";
import { getProofBypassStatus, getProofVideoSettings, getTaskProofVideos, requestProofBypass, submitProofAndMove, type ProofVideoInput } from "@/actions/proof-of-work";
import { setTaskSprint } from "@/actions/sprint";
import { assignTaskToMe, createTask, declineTask, deleteTask, getEligibleAssignees, getTasksByProject, moveTask, updateTask } from "@/actions/task";
import { getTaskDetailPanel } from "@/actions/task-detail-panel";
import { getTaskHistory } from "@/actions/task-history";
import { saveTaskAnswers } from "@/actions/task-question";
import { stageForSprintStatus } from "@/lib/task-stage";
import { taskCode } from "@/lib/task-label";
import { uploadFileToR2 } from "@/lib/upload";
import { splitChildId } from "@/next-ui/panes/pane-kinds";
import type { KanbanTask, Stage } from "@/store/kanban";

import { projectSprintsKey, projectTasksKey } from "./keys";
import { projectKey } from "./projects";

/**
 * A project's tasks (the road map and the active sprint read the same list) and one task's
 * detail, through the existing server actions. A task pane's id is `<projectId>_<taskId>`.
 * The list is typed as the board's `KanbanTask`, the way the live panel reads it.
 *
 * The changes go through the same actions the live panel calls — moving a task between
 * stages, scheduling it into a sprint, editing it, answering its questions, declining it,
 * proving its work — so both panels see the same board and the server checks every right.
 * A move is shown at once and taken back if the server refuses it.
 */

export type TaskRow = KanbanTask;
export type TaskPanel = Awaited<ReturnType<typeof getTaskDetailPanel>>;
export type TaskDetail = TaskPanel["task"];
export type TaskComment = {
  id: string;
  content: string;
  createdAt: string | Date;
  user: { id: string; name: string | null; imageUrl: string | null };
  mentions?: { user: { id: string; name: string | null } }[];
  attachments?: { id: string; filename: string; url: string; fileSize: number | null; mimeType: string | null }[];
};
export type { ProofVideoInput };

export { projectTasksKey };
export const taskKey = (taskId: string) => ["tasks", taskId] as const;
export const taskCommentsKey = (taskId: string) => ["tasks", taskId, "comments"] as const;
export const taskProofKey = (taskId: string) => ["tasks", taskId, "proof"] as const;
export const taskHistoryKey = (taskId: string) => ["tasks", taskId, "history"] as const;
export const taskBypassKey = (taskId: string) => ["tasks", taskId, "bypass"] as const;
export const proofSettingsKey = (projectId: string) => ["projects", projectId, "proof-settings"] as const;
export const eligibleAssigneesKey = (projectId: string, stage: string) => ["projects", projectId, "assignees", stage] as const;

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

type TaskBrief = { taskType: string; taskNumber: number; title: string };

/** What names a task pane (`<projectId>_<taskId>`): from the project's task list when loaded, else the task itself. */
function useTaskBrief(paneId: string): TaskBrief | undefined {
  const ids = splitChildId(paneId);
  const projectId = ids?.parent ?? "";
  const taskId = ids?.child ?? "";
  const qc = useQueryClient();
  const fromList = qc.getQueryData<TaskRow[]>(projectTasksKey(projectId))?.find((t) => t.id === taskId);
  const record = useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => getTaskDetailPanel(taskId),
    enabled: taskId !== "" && !fromList,
    select: (p): TaskBrief => ({ taskType: p.task.taskType, taskNumber: p.task.taskNumber, title: p.task.title }),
  });
  return fromList ?? record.data;
}

/** `F-012 · Title` for the tray, the recents and the window title. */
export function useTaskLabel(paneId: string): string | undefined {
  const t = useTaskBrief(paneId);
  return t ? taskLabel(t) : undefined;
}

/** `F-012` for the breadcrumb's last crumb, as the live panel names a task there; the title is the page's heading. */
export function useTaskCrumb(paneId: string): string | undefined {
  const t = useTaskBrief(paneId);
  return t ? taskCode(t.taskType, t.taskNumber) : undefined;
}

export function taskLabel(t: TaskBrief): string {
  return `${taskCode(t.taskType, t.taskNumber)} · ${t.title}`;
}

/* ------------------------------------------------------------------------------------------ */
/* Changing tasks                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** The server's answer to a refused task change: its message is written for the person. */
export class TaskActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskActionError";
  }
}

/** The server said no with a code the screens act on, not a sentence. */
export const PROOF_REQUIRED = "PROOF_REQUIRED";
export const ESTIMATE_REQUIRED = "ESTIMATE_REQUIRED";
const REQUIRED_QUESTIONS = "REQUIRED_QUESTIONS:";

/** "Answer these first: …" from the server's coded refusal, or the message as it came. */
export function taskErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith(REQUIRED_QUESTIONS)) {
    try {
      const missing = JSON.parse(msg.slice(REQUIRED_QUESTIONS.length)) as string[];
      return `Answer these first: ${missing.join("; ")}`;
    } catch {
      return "Answer the task's required questions first.";
    }
  }
  if (msg === PROOF_REQUIRED) return "Upload a proof video before moving this task to Internal review.";
  if (msg === ESTIMATE_REQUIRED) return "Add an estimate before starting development.";
  return msg || "Something went wrong.";
}

function unwrap<T extends { success: boolean; error?: string }>(r: T): void {
  if (!r.success) throw new TaskActionError(r.error ?? "Something went wrong.");
}

/**
 * After any change to the tasks: the list, the sprints (their counts), the project (its
 * counts) and the changed task's own record. Returned from `onSettled`, so a mutation counts
 * as pending until the board shows the server's version.
 */
export function useTasksRefresh(projectId: string) {
  const qc = useQueryClient();
  return (taskId?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectTasksKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: projectSprintsKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true }),
      taskId ? qc.invalidateQueries({ queryKey: taskKey(taskId) }) : Promise.resolve(),
    ]).then(() => undefined);
}

/** The list with one task changed, for a change shown before the server confirms it. */
function patchTask(qc: ReturnType<typeof useQueryClient>, projectId: string, taskId: string, patch: Partial<TaskRow>) {
  const key = projectTasksKey(projectId);
  const before = qc.getQueryData<TaskRow[]>(key);
  qc.setQueryData<TaskRow[]>(key, (prev) => prev?.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  return () => qc.setQueryData(key, before);
}

export interface MoveTaskInput {
  taskId: string;
  stage: Stage;
  order: number;
  estimatedMinutes?: number;
  proofOfWorkId?: string;
}

/**
 * A task to another stage (or another place in its stage). Shown at once; a refusal puts it
 * back and surfaces as a `TaskActionError` — `PROOF_REQUIRED` and `ESTIMATE_REQUIRED` are the
 * two the boards answer with a dialog.
 */
export function useMoveTask(projectId: string) {
  const qc = useQueryClient();
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: async (input: MoveTaskInput) => unwrap(await moveTask(input)),
    onMutate: (input) => {
      void qc.cancelQueries({ queryKey: projectTasksKey(projectId) });
      return { undo: patchTask(qc, projectId, input.taskId, { stage: input.stage, order: input.order }) };
    },
    onError: (_err, _input, ctx) => ctx?.undo(),
    onSettled: (_r, _e, input) => refresh(input.taskId),
  });
}

/** Several tasks to new places in one stage (a reorder): all at once, the list shown reordered meanwhile. */
export function useReorderTasks(projectId: string) {
  const qc = useQueryClient();
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: async (moves: { taskId: string; stage: Stage; order: number }[]) => {
      const results = await Promise.all(moves.map((m) => moveTask(m)));
      const failed = results.find((r) => !r.success);
      if (failed && !failed.success) throw new TaskActionError(failed.error);
    },
    onMutate: (moves) => {
      const key = projectTasksKey(projectId);
      const before = qc.getQueryData<TaskRow[]>(key);
      const orders = new Map(moves.map((m) => [m.taskId, m.order]));
      qc.setQueryData<TaskRow[]>(key, (prev) => prev?.map((t) => (orders.has(t.id) ? { ...t, order: orders.get(t.id)! } : t)));
      return { undo: () => qc.setQueryData(key, before) };
    },
    onError: (_err, _input, ctx) => ctx?.undo(),
    onSettled: () => refresh(),
  });
}

export interface ScheduleTaskInput {
  taskId: string;
  /** The sprint to put it in, or `null` for the backlog. */
  sprintId: string | null;
  sprintName?: string | null;
  sprintStatus?: string | null;
  estimatedMinutes?: number | null;
  /** Why, when a running sprint is joined or left (the server insists). */
  reason?: string;
}

/**
 * A task into a sprint, to another sprint, or back to the backlog — what the Planned and Next
 * lanes mean. Shown at once with the stage the sprint gives it; a refusal puts it back.
 */
export function useScheduleTask(projectId: string) {
  const qc = useQueryClient();
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: async (input: ScheduleTaskInput) => {
      await setTaskSprint(input.taskId, input.sprintId, input.estimatedMinutes, input.reason);
    },
    onMutate: (input) => {
      void qc.cancelQueries({ queryKey: projectTasksKey(projectId) });
      const stage = (stageForSprintStatus(input.sprintStatus ?? null) ?? "TODO") as Stage;
      return {
        undo: patchTask(qc, projectId, input.taskId, {
          sprintId: input.sprintId,
          sprintName: input.sprintName ?? null,
          stage,
          ...(input.sprintId ? {} : { assignee: null, estimatedMinutes: null }),
        }),
      };
    },
    onError: (_err, _input, ctx) => ctx?.undo(),
    onSettled: (_r, _e, input) => refresh(input.taskId),
  });
}

export type NewTaskInput = Parameters<typeof createTask>[0];

export function useCreateTask(projectId: string) {
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: (input: Omit<NewTaskInput, "projectId">) => createTask({ projectId, ...input }),
    onSettled: () => refresh(),
  });
}

export type TaskChanges = Omit<Parameters<typeof updateTask>[0], "taskId">;

/** Title, description, priority, assignee or estimate; the task's record and the list are read again. */
export function useUpdateTask(projectId: string, taskId: string) {
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: (changes: TaskChanges) => updateTask({ taskId, ...changes }),
    onSettled: () => refresh(taskId),
  });
}

export function useSaveTaskAnswers(projectId: string, taskId: string) {
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: (answers: { questionId: string; answer: string }[]) => saveTaskAnswers({ taskId, answers }),
    onSettled: () => refresh(taskId),
  });
}

export function useAssignTaskToMe(projectId: string, taskId: string) {
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: async () => unwrap(await assignTaskToMe(taskId)),
    onSettled: () => refresh(taskId),
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: (_r, taskId) => {
      qc.setQueryData<TaskRow[]>(projectTasksKey(projectId), (prev) => prev?.filter((t) => t.id !== taskId));
    },
    onSettled: (_r, _e, taskId) => refresh(taskId),
  });
}

export interface UploadedAttachment {
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string;
}

/** Files from this device to storage, one after another; `onProgress` gets the file's index and percent. */
export async function uploadAttachments(files: File[], onProgress?: (index: number, pct: number) => void): Promise<UploadedAttachment[]> {
  const out: UploadedAttachment[] = [];
  for (const [index, file] of files.entries()) {
    const up = await uploadFileToR2(file, (pct) => onProgress?.(index, pct));
    out.push({ filename: up.filename, url: up.url, fileSize: up.fileSize, mimeType: up.mimeType ?? file.type ?? "application/octet-stream" });
  }
  return out;
}

/** Internal review → In development with a comment (and files), the one way a task is sent back. */
export function useDeclineTask(projectId: string) {
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: async (input: { taskId: string; comment: string; attachments?: UploadedAttachment[] }) => unwrap(await declineTask(input)),
    onSettled: (_r, _e, input) => refresh(input.taskId),
  });
}

/**
 * The proof of work on the way into Internal review: the videos (already in storage) are
 * recorded and the task moves in one call. With no videos the server moves the task only on a
 * "No video" project.
 */
export function useSubmitProof(projectId: string) {
  const refresh = useTasksRefresh(projectId);
  return useMutation({
    mutationFn: async (input: { taskId: string; order: number; videos: ProofVideoInput[]; useBypass?: boolean }) =>
      unwrap(await submitProofAndMove({ taskId: input.taskId, stage: "INTERNAL_REVIEW", order: input.order, videos: input.videos, useBypass: input.useBypass })),
    onSettled: (_r, _e, input) => refresh(input.taskId),
  });
}

/** The project's video rule and the people who upload for others ("Assign" mode). */
export function useProofVideoSettings(projectId: string, enabled = true) {
  return useQuery({ queryKey: proofSettingsKey(projectId), queryFn: () => getProofVideoSettings(projectId), enabled: enabled && projectId !== "", staleTime: 30_000 });
}

/** Whether the viewer has asked for this task's video to be uploaded for them, and where that stands. */
export function useProofBypassStatus(taskId: string, enabled = true) {
  return useQuery({ queryKey: taskBypassKey(taskId), queryFn: () => getProofBypassStatus(taskId), enabled: enabled && taskId !== "", staleTime: 10_000 });
}

export function useRequestProofBypass(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => requestProofBypass(taskId),
    onSettled: () => qc.invalidateQueries({ queryKey: taskBypassKey(taskId) }),
  });
}

/** The videos recorded for a task so far, grouped the way the live panel groups them. */
export function useTaskProofVideos(taskId: string, enabled = true) {
  return useQuery({ queryKey: taskProofKey(taskId), queryFn: () => getTaskProofVideos(taskId), enabled: enabled && taskId !== "", staleTime: 10_000 });
}

/**
 * A task's stage-by-stage life and the changes made to it, for the people whose role may see
 * it (the server decides and answers `allowed: false` otherwise). Under the task's key, so a
 * change to the task refreshes it too.
 */
export function useTaskHistory(taskId: string, enabled = true) {
  return useQuery({ queryKey: taskHistoryKey(taskId), queryFn: () => getTaskHistory(taskId), enabled: enabled && taskId !== "", staleTime: 10_000 });
}

/** The people a task in this stage may be given to (the server's role tracks). */
export function useEligibleAssignees(projectId: string, stage: string, enabled = true) {
  return useQuery({
    queryKey: eligibleAssigneesKey(projectId, stage),
    queryFn: () => getEligibleAssignees(projectId, stage),
    enabled: enabled && projectId !== "" && stage !== "",
    staleTime: 60_000,
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Comments                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export function useTaskComments(taskId: string, enabled = true) {
  return useQuery({
    queryKey: taskCommentsKey(taskId),
    queryFn: async () => {
      const r = await getComments(taskId);
      if (!r.success) throw new TaskActionError(r.error);
      return r.comments as unknown as TaskComment[];
    },
    enabled: enabled && taskId !== "",
    staleTime: 10_000,
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { content: string; attachments?: UploadedAttachment[]; mentionedUserIds?: string[] }) => {
      const r = await createComment({ taskId, ...input });
      if (!r.success) throw new TaskActionError(r.error);
      return r.comment as unknown as TaskComment;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taskCommentsKey(taskId) }),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: (_r, commentId) => {
      qc.setQueryData<TaskComment[]>(taskCommentsKey(taskId), (prev) => prev?.filter((c) => c.id !== commentId));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taskCommentsKey(taskId) }),
  });
}
