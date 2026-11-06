"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createBoard, getBoard, viewerBoardState } from "@/actions/board";
import { createBoardCard, deleteBoardCard, moveBoardCard, updateBoardCard } from "@/actions/board-card";
import { setProjectBoard } from "@/actions/project";

import { movedBoard, type KanbanBoard } from "./kanban-logic";
import { PROJECTS_KEY, projectKey } from "./projects";

/**
 * The project's Kanban: a board of the simple kind — To do, In progress, Completed, one card
 * type, and cards that are a title and a description. It reads and writes through the board
 * actions the live panel uses, so both see the same cards; the server checks every right.
 */

export type { KanbanBoard, KanbanCard, KanbanColumn } from "./kanban-logic";

export const boardKey = (projectId: string) => ["projects", projectId, "board"] as const;
export const boardStateKey = (projectId: string) => ["projects", projectId, "board-state"] as const;

/** `null` when the project has no Kanban switched on, or the viewer may not open it. */
export function useBoard(projectId: string) {
  return useQuery({ queryKey: boardKey(projectId), queryFn: () => getBoard(projectId), enabled: projectId !== "", staleTime: 10_000 });
}

/** Whether a board was ever added and whether it is on: what the Settings switch needs. */
export function useBoardState(projectId: string, enabled = true) {
  return useQuery({ queryKey: boardStateKey(projectId), queryFn: () => viewerBoardState(projectId), enabled: enabled && projectId !== "", staleTime: 30_000 });
}

/** The server's answer, or the error it put in words. */
function unwrap<T>(result: { success: true; data: T } | { success: false; error: string }): T {
  if (!result.success) throw new Error(result.error);
  return result.data;
}

function useBoardRefresh(projectId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: boardKey(projectId) }).then(() => undefined);
}

export function useCreateCard(projectId: string) {
  const refresh = useBoardRefresh(projectId);
  return useMutation({
    mutationFn: async (input: { boardId: string; columnId: string; cardTypeId: string; title: string; description?: string }) =>
      unwrap(await createBoardCard(input)),
    onSettled: refresh,
  });
}

export function useUpdateCard(projectId: string) {
  const refresh = useBoardRefresh(projectId);
  return useMutation({
    mutationFn: async (input: { cardId: string; title?: string; description?: string | null }) => unwrap(await updateBoardCard(input)),
    onSettled: refresh,
  });
}

/**
 * Moves a card to a column, at `index` among that column's cards. The board in the cache is
 * rearranged first, so the card lands where it was dropped before the server answers; on an
 * error the previous board comes back.
 */
export function useMoveCard(projectId: string) {
  const qc = useQueryClient();
  const refresh = useBoardRefresh(projectId);
  return useMutation({
    mutationFn: async (input: { cardId: string; columnId: string; index: number }) => unwrap(await moveBoardCard(input)),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: boardKey(projectId) });
      const previous = qc.getQueryData<KanbanBoard | null>(boardKey(projectId));
      if (previous) qc.setQueryData(boardKey(projectId), movedBoard(previous, input));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous !== undefined) qc.setQueryData(boardKey(projectId), context.previous);
    },
    onSettled: refresh,
  });
}

export function useDeleteCard(projectId: string) {
  const refresh = useBoardRefresh(projectId);
  return useMutation({ mutationFn: async (cardId: string) => unwrap(await deleteBoardCard(cardId)), onSettled: refresh });
}

/**
 * The Kanban switch in Settings. On: the project's board is shown again, or created when it
 * never had one (To do, In progress, Completed, one card type). Off: the board is hidden; its
 * cards stay. The server refuses to switch it off while sprints are off too.
 */
export function useSetProjectKanban(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!enabled) return setProjectBoard({ projectId, enabled: false });
      const state = await viewerBoardState(projectId);
      if (state.exists) return setProjectBoard({ projectId, enabled: true });
      unwrap(await createBoard(projectId));
      return { enabled: true };
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: boardStateKey(projectId) }),
        qc.invalidateQueries({ queryKey: boardKey(projectId) }),
        qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true }),
        qc.invalidateQueries({ queryKey: PROJECTS_KEY, exact: true }),
      ]).then(() => undefined),
  });
}
