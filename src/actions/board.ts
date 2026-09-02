"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import {
  BoardAccessError,
  boardContextForProject,
  requireBoardAction,
  requireBoardActionForColumn,
  runBoardAction,
  type BoardResult,
} from "@/lib/board-access";
import { SEEDED_BOARD_ROLES, type BoardPermissions } from "@/lib/board-permissions";
import { DEFAULT_BOARD_COLOR, DEFAULT_BOARD_ICON, isBoardColor } from "@/lib/board-palette";
import { POSITION_STEP, planReorder } from "@/lib/board-order";
import { isCardComplete } from "@/lib/board-fields";

/**
 * The board, everything on it, and what the caller may do with it.
 *
 * Permissions travel with the data on purpose: the screen needs them to decide
 * what to offer, and shipping them alongside the board avoids a second
 * round-trip that could disagree with the first.
 */

export interface BoardColumnDTO {
  id: string;
  name: string;
  color: string;
  position: number;
}

export interface BoardFieldDTO {
  id: string;
  label: string;
  type: string;
  options: string | null;
  multiple: boolean;
  required: boolean;
  position: number;
}

export interface BoardCardTypeDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  position: number;
  fields: BoardFieldDTO[];
}

export interface BoardCardDTO {
  id: string;
  cardNumber: number;
  title: string;
  columnId: string;
  cardTypeId: string;
  position: number;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  commentCount: number;
  /** Precomputed so a card can be flagged without loading its answers. */
  isComplete: boolean;
}

export interface BoardDTO {
  id: string;
  projectId: string;
  name: string;
  columns: BoardColumnDTO[];
  cardTypes: BoardCardTypeDTO[];
  cards: BoardCardDTO[];
  /** Who a card may be assigned to: the project's roster, minus clients. */
  members: { id: string; name: string | null; imageUrl: string | null }[];
  permissions: BoardPermissions;
  viewerId: string;
}

/** The columns a new board starts with, so it is usable before it is configured. */
const STARTER_COLUMNS = [
  { name: "To do", color: "slate" },
  { name: "In progress", color: "sky" },
  { name: "Done", color: "green" },
];

const STARTER_CARD_TYPE = { name: "Task", icon: DEFAULT_BOARD_ICON, color: "green" };

/**
 * Turn a board on for a project.
 *
 * Restricted to whoever already administers the project, because there is no
 * board role to consult yet — this is the call that creates them. The creator
 * is made a board admin in the same transaction, or nobody could configure what
 * they just made.
 */
export async function createBoard(projectId: string): Promise<BoardResult<{ id: string }>> {
  return runBoardAction(async () => {
    const { user, member } = await requireProjectMember(projectId);

    const isProjectAdmin =
      user.systemRole === "ADMIN" || member.role === "ADMIN" || member.projectRole?.isAdmin === true;
    if (!isProjectAdmin) {
      throw new BoardAccessError("Only a project admin can add a board.");
    }

    const existing = await prisma.board.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (existing) return { id: existing.id };

    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.board.create({ data: { projectId } });

      await tx.boardRole.createMany({
        data: SEEDED_BOARD_ROLES.map((role) => ({
          boardId: created.id,
          name: role.name,
          isDefault: role.isDefault,
          ...role.flags,
        })),
      });

      await tx.boardColumn.createMany({
        data: STARTER_COLUMNS.map((column, i) => ({
          boardId: created.id,
          name: column.name,
          color: column.color,
          position: (i + 1) * POSITION_STEP,
        })),
      });

      await tx.boardCardType.create({
        data: {
          boardId: created.id,
          name: STARTER_CARD_TYPE.name,
          icon: STARTER_CARD_TYPE.icon,
          color: STARTER_CARD_TYPE.color,
          position: POSITION_STEP,
        },
      });

      const adminRole = await tx.boardRole.findFirst({
        where: { boardId: created.id, isAdmin: true },
        select: { id: true },
      });
      if (adminRole) {
        await tx.boardMember.create({
          data: { boardId: created.id, userId: user.id, roleId: adminRole.id },
        });
      }

      return created;
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return { id: board.id };
  });
}

/**
 * Where this project stands on boards, from this viewer's seat.
 *
 * Three separate questions, because project settings needs to tell them apart:
 * a board that was never added offers an "Add a board" button, while one that
 * exists but is switched off offers a switch to bring it back. Only `visible`
 * drives the tab.
 *
 * Access failures come back as false rather than as an exception, so someone
 * without board access simply sees no tab instead of one that errors when
 * clicked.
 */
export async function viewerBoardState(projectId: string): Promise<{
  /** A board has been added to this project, switched on or not. */
  exists: boolean;
  /** It exists and is not hidden. */
  enabled: boolean;
  /** It exists, is not hidden, and this viewer may open it. */
  visible: boolean;
}> {
  const board = await prisma.board.findUnique({
    where: { projectId },
    select: { id: true, enabled: true },
  });
  if (!board) return { exists: false, enabled: false, visible: false };
  if (!board.enabled) return { exists: true, enabled: false, visible: false };
  try {
    await boardContextForProject(projectId);
    return { exists: true, enabled: true, visible: true };
  } catch {
    return { exists: true, enabled: true, visible: false };
  }
}

/**
 * Null when the project has no board, the board is switched off, or this viewer
 * may not open it. The `enabled` check matters for a tab left open in another
 * window while somebody hides the board.
 */
export async function getBoard(projectId: string): Promise<BoardDTO | null> {
  const board = await prisma.board.findUnique({
    where: { projectId },
    select: { id: true, enabled: true },
  });
  if (!board || !board.enabled) return null;

  let context;
  try {
    context = await boardContextForProject(projectId);
  } catch {
    return null;
  }

  const [columns, cardTypes, cards, projectMembers] = await Promise.all([
    prisma.boardColumn.findMany({
      where: { boardId: board.id },
      orderBy: { position: "asc" },
    }),
    prisma.boardCardType.findMany({
      where: { boardId: board.id },
      orderBy: { position: "asc" },
      include: { fields: { orderBy: { position: "asc" } } },
    }),
    prisma.boardCard.findMany({
      where: { boardId: board.id, archivedAt: null },
      orderBy: { position: "asc" },
      include: {
        assignee: { select: { id: true, name: true, imageUrl: true } },
        fieldValues: { select: { fieldId: true, value: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.projectMember.findMany({
      where: { projectId, user: { systemRole: { not: "CLIENT" }, blocked: false } },
      select: { user: { select: { id: true, name: true, imageUrl: true } } },
    }),
  ]);

  const fieldsByType = new Map(
    cardTypes.map((type) => [type.id, type.fields]),
  );

  return {
    id: board.id,
    projectId: context.board.projectId,
    name: context.board.name,
    columns,
    cardTypes,
    cards: cards.map((card) => {
      const values = Object.fromEntries(
        card.fieldValues.map((value) => [value.fieldId, value.value]),
      );
      return {
        id: card.id,
        cardNumber: card.cardNumber,
        title: card.title,
        columnId: card.columnId,
        cardTypeId: card.cardTypeId,
        position: card.position,
        assignee: card.assignee,
        commentCount: card._count.comments,
        isComplete: isCardComplete(fieldsByType.get(card.cardTypeId) ?? [], values),
      };
    }),
    members: projectMembers
      .map((member) => member.user)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    permissions: context.permissions,
    viewerId: context.userId,
  };
}

// ─── Columns ─────────────────────────────────────────────────────────────────

export async function createBoardColumn(input: {
  boardId: string;
  name: string;
  color?: string;
}): Promise<BoardResult<BoardColumnDTO>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "manageColumns");

    const name = input.name.trim();
    if (!name) throw new BoardAccessError("A column needs a name.");

    const last = await prisma.boardColumn.findFirst({
      where: { boardId: input.boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const column = await prisma.boardColumn.create({
      data: {
        boardId: input.boardId,
        name,
        color: input.color && isBoardColor(input.color) ? input.color : DEFAULT_BOARD_COLOR,
        position: (last?.position ?? 0) + POSITION_STEP,
      },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return column;
  });
}

export async function updateBoardColumn(input: {
  columnId: string;
  name?: string;
  color?: string;
}): Promise<BoardResult<BoardColumnDTO>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForColumn(input.columnId, "manageColumns");

    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BoardAccessError("A column needs a name.");
    }

    const column = await prisma.boardColumn.update({
      where: { id: input.columnId },
      data: {
        ...(name ? { name } : {}),
        ...(input.color && isBoardColor(input.color) ? { color: input.color } : {}),
      },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return column;
  });
}

/**
 * Deleting a column is refused while it still holds cards.
 *
 * The foreign key is RESTRICT so the database would refuse this anyway; the
 * count is here to refuse it with a sentence somebody can act on instead of a
 * constraint violation.
 */
export async function deleteBoardColumn(columnId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForColumn(columnId, "manageColumns");

    const cardCount = await prisma.boardCard.count({
      where: { columnId, archivedAt: null },
    });
    if (cardCount > 0) {
      throw new BoardAccessError(
        `That column still holds ${cardCount} ${cardCount === 1 ? "card" : "cards"}. Move them somewhere else first.`,
      );
    }

    const remaining = await prisma.boardColumn.count({ where: { boardId } });
    if (remaining <= 1) {
      throw new BoardAccessError("A board needs at least one column.");
    }

    // Archived cards still point at the column, and RESTRICT counts them.
    await prisma.$transaction(async (tx) => {
      await tx.boardCard.deleteMany({ where: { columnId } });
      await tx.boardColumn.delete({ where: { id: columnId } });
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

export async function reorderBoardColumns(input: {
  boardId: string;
  orderedIds: string[];
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "manageColumns");

    // Ids are checked against the board rather than trusted, so a caller cannot
    // drag a column belonging to somebody else's board into this order.
    const owned = await prisma.boardColumn.findMany({
      where: { boardId: input.boardId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((column) => column.id));
    const ordered = input.orderedIds.filter((id) => ownedIds.has(id));

    await prisma.$transaction(
      planReorder(ordered).map((row) =>
        prisma.boardColumn.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}