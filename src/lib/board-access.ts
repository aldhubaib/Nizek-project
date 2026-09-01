import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import {
  ACTION_LABEL,
  boardPermissionsFromRole,
  canBoard,
  SYSTEM_ADMIN_BOARD_PERMISSIONS,
  type BoardAction,
  type BoardPermissions,
} from "@/lib/board-permissions";

/**
 * The gate every board server action goes through.
 *
 * Two layers, in this order. Project membership decides whether the board is
 * visible at all, reusing `requireProjectMember` so board access can never be
 * broader than access to the project holding it. The board's own role then
 * decides what may be done. Nothing is trusted from the client: a screen that
 * hides a button is a courtesy, and this is the rule.
 */

export interface BoardContext {
  userId: string;
  board: { id: string; projectId: string; name: string };
  permissions: BoardPermissions;
  /** True for a system admin, who reached this by bypassing the role table. */
  isSystemAdmin: boolean;
}

export class BoardAccessError extends Error {}

export type BoardResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Wraps a mutation so its failure reaches the person who caused it.
 *
 * Next redacts an error thrown out of a server action in production, which
 * would turn "you cannot move cards on this board" into a blank alert. The
 * board actions therefore hand failures back as values, the same shape
 * `moveTask` uses for the same reason.
 */
export async function runBoardAction<T>(
  fn: () => Promise<T>,
): Promise<BoardResult<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Something went wrong.";
    if (!(error instanceof BoardAccessError)) {
      console.error("[board]", error);
    }
    return { success: false, error: message };
  }
}

async function loadContext(
  where: { projectId: string } | { id: string },
): Promise<BoardContext> {
  const board = await prisma.board.findUnique({
    where: where as { projectId: string },
    select: { id: true, projectId: true, name: true },
  });
  if (!board) throw new BoardAccessError("This project has no board.");

  const { user } = await requireProjectMember(board.projectId);

  // Clients are kept off boards entirely for now. Everything client-facing in
  // this app runs through the alias layer so a client never sees a real name or
  // photo, and boards have no alias support yet — a card's assignee would leak
  // exactly what the aliases exist to hide. This is a v1 limit, not a rule
  // about what clients should be able to see.
  if (user.systemRole === "CLIENT") {
    throw new BoardAccessError("Boards are not available to client accounts.");
  }

  if (user.systemRole === "ADMIN") {
    return {
      userId: user.id,
      board,
      permissions: { ...SYSTEM_ADMIN_BOARD_PERMISSIONS },
      isSystemAdmin: true,
    };
  }

  const member = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: board.id, userId: user.id } },
    select: { role: true },
  });

  // Falling back to the board's default role is what stops a freshly created
  // board from being invisible to everyone but whoever made it.
  const role =
    member?.role ??
    (await prisma.boardRole.findFirst({
      where: { boardId: board.id, isDefault: true },
    }));

  return {
    userId: user.id,
    board,
    permissions: boardPermissionsFromRole(role),
    isSystemAdmin: false,
  };
}

export const boardContextForProject = cache((projectId: string) =>
  loadContext({ projectId }),
);

export const boardContextForBoard = cache((boardId: string) =>
  loadContext({ id: boardId }),
);

export function assertBoardAction(
  context: BoardContext,
  action: BoardAction,
): void {
  if (canBoard(context.permissions, action)) return;
  throw new BoardAccessError(
    `You do not have permission to ${ACTION_LABEL[action]}.`,
  );
}

export async function requireBoardAction(
  boardId: string,
  action: BoardAction,
): Promise<BoardContext> {
  const context = await boardContextForBoard(boardId);
  assertBoardAction(context, action);
  return context;
}

/**
 * The same check for actions that arrive holding a child row rather than the
 * board. Each resolves upward to the owning board first, so a caller cannot
 * reach a column or card on a board they have no claim to by passing its id
 * directly.
 */

export async function requireBoardActionForColumn(
  columnId: string,
  action: BoardAction,
): Promise<{ context: BoardContext; boardId: string }> {
  const column = await prisma.boardColumn.findUnique({
    where: { id: columnId },
    select: { boardId: true },
  });
  if (!column) throw new BoardAccessError("That column no longer exists.");
  return { context: await requireBoardAction(column.boardId, action), boardId: column.boardId };
}

export async function requireBoardActionForCardType(
  cardTypeId: string,
  action: BoardAction,
): Promise<{ context: BoardContext; boardId: string }> {
  const cardType = await prisma.boardCardType.findUnique({
    where: { id: cardTypeId },
    select: { boardId: true },
  });
  if (!cardType) throw new BoardAccessError("That card type no longer exists.");
  return { context: await requireBoardAction(cardType.boardId, action), boardId: cardType.boardId };
}

export async function requireBoardActionForField(
  fieldId: string,
  action: BoardAction,
): Promise<{ context: BoardContext; boardId: string }> {
  const field = await prisma.boardField.findUnique({
    where: { id: fieldId },
    select: { cardType: { select: { boardId: true } } },
  });
  if (!field) throw new BoardAccessError("That field no longer exists.");
  const boardId = field.cardType.boardId;
  return { context: await requireBoardAction(boardId, action), boardId };
}

export async function requireBoardActionForCard(
  cardId: string,
  action: BoardAction,
): Promise<{ context: BoardContext; boardId: string }> {
  const card = await prisma.boardCard.findUnique({
    where: { id: cardId },
    select: { boardId: true },
  });
  if (!card) throw new BoardAccessError("That card no longer exists.");
  return { context: await requireBoardAction(card.boardId, action), boardId: card.boardId };
}

export async function requireBoardActionForRole(
  roleId: string,
  action: BoardAction,
): Promise<{ context: BoardContext; boardId: string }> {
  const role = await prisma.boardRole.findUnique({
    where: { id: roleId },
    select: { boardId: true },
  });
  if (!role) throw new BoardAccessError("That role no longer exists.");
  return { context: await requireBoardAction(role.boardId, action), boardId: role.boardId };
}
