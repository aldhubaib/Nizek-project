"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addSprintReviewVideos,
  createSprint,
  deleteSprint,
  ensureSprintForColumn,
  getSprintPlanFlags,
  getSprintPlanningTasks,
  getSprintProofOfWork,
  getSprintReviewTasks,
  getSprintSnapshots,
  listSprints,
  removeSprintReviewVideo,
  setSprintBoardStatus,
  updateSprint,
  updateSprintPlanningTask,
  updateSprintTaskPlan,
  type SprintDTO,
  type SprintReviewVideoDTO,
  type SprintSnapshotTask,
} from "@/actions/sprint";
import { endSprintFromDoc, openSprintDoc, startSprintFromDoc, updateSprintDocCard, updateSprintDocInfo, type SprintDocState } from "@/actions/sprint-doc-sync";
import type { SprintBoardColumn } from "@/lib/sprint-status";
import { splitChildId } from "@/next-ui/panes/pane-kinds";

import { projectNotesKey, projectSprintsKey, projectTasksKey } from "./keys";
import { projectKey } from "./projects";

/**
 * A project's sprints, the task snapshots its closed sprints keep, one sprint's plan, review
 * and document, and the changes to them: a new sprint, its name and dates, a task's estimate,
 * assignee, Decision and Risk, the document's rows and cards, starting it, ending it, deleting
 * it. All through the actions the live panel calls, which check the rights again.
 */

export type { SprintDTO, SprintDocState, SprintReviewVideoDTO, SprintSnapshotTask };
export type SprintPlan = Awaited<ReturnType<typeof getSprintPlanningTasks>>;
export type SprintPlanTask = SprintPlan["tasks"][number];
export type SprintReview = Awaited<ReturnType<typeof getSprintReviewTasks>>;
export type SprintProof = Awaited<ReturnType<typeof getSprintProofOfWork>>;

export { projectSprintsKey };
export const sprintSnapshotsKey = (projectId: string) => ["projects", projectId, "sprint-snapshots"] as const;
export const sprintPlanKey = (sprintId: string) => ["sprints", sprintId, "plan"] as const;
export const sprintReviewKey = (sprintId: string) => ["sprints", sprintId, "review"] as const;
export const sprintProofKey = (sprintId: string) => ["sprints", sprintId, "proof"] as const;
export const sprintDocKey = (sprintId: string) => ["sprints", sprintId, "doc"] as const;

export function useSprints(projectId: string) {
  return useQuery({
    queryKey: projectSprintsKey(projectId),
    queryFn: () => listSprints(projectId),
    enabled: projectId !== "",
    staleTime: 5_000,
  });
}

/** The breadcrumb's name for a sprint pane (`<projectId>_<sprintId>`), from the project's sprint list. */
export function useSprintLabel(paneId: string): string | undefined {
  const ids = splitChildId(paneId);
  const sprints = useSprints(ids?.parent ?? "");
  return sprints.data?.find((s) => s.id === ids?.child)?.name;
}

/** Only asked for once a closed sprint is on screen; its rows are what the sprint looked like when it ended. */
export function useSprintSnapshots(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: sprintSnapshotsKey(projectId),
    queryFn: () => getSprintSnapshots(projectId),
    enabled: enabled && projectId !== "",
    staleTime: 60_000,
  });
}

/** The sprint's plan: its tasks with estimate, assignee, Decision and Risk, its dates, the running sprint's name if one blocks it. */
export function useSprintPlan(sprintId: string, enabled = true) {
  return useQuery({ queryKey: sprintPlanKey(sprintId), queryFn: () => getSprintPlanningTasks(sprintId), enabled: enabled && sprintId !== "" });
}

/** The sprint's review: what was completed and what was not, and the work that left it. */
export function useSprintReview(sprintId: string, enabled = true) {
  return useQuery({ queryKey: sprintReviewKey(sprintId), queryFn: () => getSprintReviewTasks(sprintId), enabled: enabled && sprintId !== "" });
}

/**
 * Which tasks already have a Decision or a Risk written for their open sprint, keyed
 * `sprintId:taskId` — what a move out of the sprint would clear, so the board can say so.
 */
export function useSprintPlanFlags(projectId: string, enabled = true) {
  return useQuery({ queryKey: ["projects", projectId, "sprint-plan-flags"] as const, queryFn: () => getSprintPlanFlags(projectId), enabled, staleTime: 30_000 });
}

/**
 * The sprint's document as the live panel keeps it: its Sprint Information rows, what was typed
 * into each outcome card, what the sprint was started with. Opening it writes it when someone
 * who may write it has none yet, as the live editor does.
 */
export function useSprintDoc(sprintId: string, enabled = true) {
  return useQuery({ queryKey: sprintDocKey(sprintId), queryFn: () => openSprintDoc(sprintId), enabled: enabled && sprintId !== "" });
}

/** The proof each task in the sprint carries (videos, or a waiver), by task id. */
export function useSprintProof(sprintId: string, enabled = true) {
  return useQuery({ queryKey: sprintProofKey(sprintId), queryFn: () => getSprintProofOfWork(sprintId), enabled: enabled && sprintId !== "" });
}

/**
 * After any change to the sprints: the sprints, the tasks (their stages follow the sprint),
 * the project's counts, the notes (a sprint document may have been written), and the changed
 * sprint's own plan and review.
 */
export function useSprintsRefresh(projectId: string) {
  const qc = useQueryClient();
  return (sprintId?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectSprintsKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: projectTasksKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: sprintSnapshotsKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: ["projects", projectId, "sprint-plan-flags"], exact: true }),
      qc.invalidateQueries({ queryKey: projectNotesKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true }),
      sprintId ? qc.invalidateQueries({ queryKey: ["sprints", sprintId] }) : Promise.resolve(),
    ]).then(() => undefined);
}

export type NewSprintInput = Omit<Parameters<typeof createSprint>[0], "projectId">;

export function useCreateSprint(projectId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({ mutationFn: (input: NewSprintInput) => createSprint({ projectId, ...input }), onSettled: () => refresh() });
}

export type SprintChanges = Omit<Parameters<typeof updateSprint>[0], "sprintId">;

export function useUpdateSprint(projectId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: ({ sprintId, ...changes }: SprintChanges & { sprintId: string }) => updateSprint({ sprintId, ...changes }),
    onSettled: (_r, _e, input) => refresh(input.sprintId),
  });
}

/** The sprint a lane stands for (Planned, Next), created on the server if the lane is empty. */
export function useEnsureSprint(projectId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({ mutationFn: (column: "PLANNED" | "NEXT") => ensureSprintForColumn(projectId, column), onSettled: () => refresh() });
}

/** A planned sprint to Next, or back. */
export function useSetSprintColumn(projectId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: ({ sprintId, column }: { sprintId: string; column: SprintBoardColumn }) => setSprintBoardStatus(sprintId, column),
    onSettled: (_r, _e, input) => refresh(input.sprintId),
  });
}

/** The plan is written into the sprint's document, then the sprint starts; its tasks go to To do. */
export function useStartSprint(projectId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: (sprintId: string) => startSprintFromDoc(sprintId),
    onSettled: (_r, _e, sprintId) => refresh(sprintId),
  });
}

/**
 * The review is brought in step with the sprint's document, then the sprint ends with a reason
 * for every task that was not finished (those go back to the backlog); the document is locked.
 */
export function useEndSprint(projectId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: ({ sprintId, reasons }: { sprintId: string; reasons?: Record<string, string> }) => endSprintFromDoc(sprintId, reasons),
    onSettled: (_r, _e, input) => refresh(input.sprintId),
  });
}

/** A Sprint Information row of the document (plan date, review date, start, end, working days). */
export function useUpdateSprintDocInfo(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof updateSprintDocInfo>[0], "sprintId">) => updateSprintDocInfo({ sprintId, ...input }),
    onSuccess: (info) => {
      qc.setQueryData<SprintDocState>(sprintDocKey(sprintId), (prev) => (prev ? { ...prev, info } : prev));
    },
    // the sprint's own dates may have moved with the row
    onSettled: (_r, _e, input) => (input.startIso !== undefined || input.endIso !== undefined ? refresh(sprintId) : qc.invalidateQueries({ queryKey: sprintDocKey(sprintId) }).then(() => undefined)),
  });
}

/** What was typed into a task's outcome card: the reason, what was delivered, the photos. */
export function useUpdateSprintDocCard(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof updateSprintDocCard>[0], "sprintId">) => updateSprintDocCard({ sprintId, ...input }),
    onSuccess: (carry, input) => {
      qc.setQueryData<SprintDocState>(sprintDocKey(sprintId), (prev) => (prev ? { ...prev, carry: { ...prev.carry, [input.taskId]: carry } } : prev));
    },
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: sprintDocKey(sprintId) }), qc.invalidateQueries({ queryKey: projectNotesKey(projectId), exact: true })]).then(() => undefined),
  });
}

export function useDeleteSprint(projectId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: ({ sprintId, confirmName }: { sprintId: string; confirmName: string }) => deleteSprint(sprintId, confirmName),
    onSettled: (_r, _e, input) => refresh(input.sprintId),
  });
}

/** A task's estimate or assignee while its sprint is being planned (and, for admins, after). */
export function useUpdatePlanTask(projectId: string, sprintId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: (input: Parameters<typeof updateSprintPlanningTask>[0]) => updateSprintPlanningTask(input),
    onSettled: () => refresh(sprintId),
  });
}

/** A task's Decision and Risk for this sprint — what the start waits for. */
export function useUpdateTaskPlan(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; decision?: string; risk?: string }) => updateSprintTaskPlan({ sprintId, ...input }),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: sprintPlanKey(sprintId) }), qc.invalidateQueries({ queryKey: projectNotesKey(projectId), exact: true })]).then(() => undefined),
  });
}

/** The sprint review's recording(s), on a "No video" project: what ending the sprint waits for. */
export function useAddSprintReviewVideos(projectId: string, sprintId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({
    mutationFn: (videos: Parameters<typeof addSprintReviewVideos>[0]["videos"]) => addSprintReviewVideos({ sprintId, videos }),
    onSettled: () => refresh(sprintId),
  });
}

export function useRemoveSprintReviewVideo(projectId: string, sprintId: string) {
  const refresh = useSprintsRefresh(projectId);
  return useMutation({ mutationFn: (videoId: string) => removeSprintReviewVideo(videoId), onSettled: () => refresh(sprintId) });
}
