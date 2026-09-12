"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  BoardAccessError,
  boardContextForBoard,
  requireBoardAction,
  requireBoardActionForCard,
  runBoardAction,
  type BoardResult,
} from "@/lib/board-access";
import { canBoard } from "@/lib/board-permissions";
import { planMove, positionForIndex } from "@/lib/board-order";
import { missingRequiredFields, type BoardFieldShape } from "@/lib/board-fields";
import type { BoardFieldDTO } from "@/actions/board";

/**
 * Cards.
 *
 * A required field flags a card rather than blocking it. That is the same
 * language the sprint side already uses for an unanswered mandatory question —
 * a badge saying the thing is incomplete, not a form that refuses to save — and
 * it matters more here, because a board has no gate to enforce it at: movement
 * between columns is free by design, so there is no transition to refuse.
 */

export interface BoardCardCommentDTO {
  id: string;
  content: string;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
}

export interface BoardCardAttachmentDTO {
  id: string;
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
  uploadedBy: { id: string; name: string | null; imageUrl: string | null };
}

export interface BoardCardDetailDTO {
  id: string;
  boardId: string;
  projectId: string;
  cardNumber: number;
  title: string;
  description: string | null;
  columnId: string;
  cardTypeId: string;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  createdAt: Date;
  startDate: Date | null;
  dueDate: Date | null;
  dueDone: boolean;
  labelIds: string[];
  fields: BoardFieldDTO[];
  values: Record<string, string>;
  missingRequired: string[];
  comments: BoardCardCommentDTO[];
  attachments: BoardCardAttachmentDTO[];
}

export async function getBoardCard(cardId: string): Promise<BoardCardDetailDTO | null> {
  const card = await prisma.boardCard.findUnique({
    where: { id: cardId },
    include: {
      assignee: { select: { id: true, name: true, imageUrl: true } },
      createdBy: { select: { id: true, name: true, imageUrl: true } },
      cardType: { include: { fields: { orderBy: { position: "asc" } } } },
      fieldValues: { select: { fieldId: true, value: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, imageUrl: true } } },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { id: true, name: true, imageUrl: true } } },
      },
      labels: { select: { labelId: true } },
    },
  });
  if (!card) return null;

  let context;
  try {
    context = await boardContextForBoard(card.boardId);
  } catch {
    return null;
  }

  const values = Object.fromEntries(
    card.fieldValues.map((value) => [value.fieldId, value.value]),
  );

  return {
    id: card.id,
    boardId: card.boardId,
    projectId: context.board.projectId,
    cardNumber: card.cardNumber,
    title: card.title,
    description: card.description,
    columnId: card.columnId,
    cardTypeId: card.cardTypeId,
    assignee: card.assignee,
    createdBy: card.createdBy,
    createdAt: card.createdAt,
    startDate: card.startDate,
    dueDate: card.dueDate,
    dueDone: card.dueDone,
    labelIds: card.labels.map((row) => row.labelId),
    fields: card.cardType.fields,
    values,
    missingRequired: missingRequiredFields(card.cardType.fields, values).map((f) => f.id),
    comments: card.comments,
    attachments: card.attachments,
  };
}

export async function createBoardCard(input: {
  boardId: string;
  columnId: string;
  cardTypeId: string;
  title: string;
}): Promise<BoardResult<{ id: string }>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "createCard");

    const title = input.title.trim();
    if (!title) throw new BoardAccessError("A card needs a title.");

    // Both are checked against this board rather than trusted, so a caller
    // cannot file a card into a column belonging to somebody else's board.
    const [column, cardType] = await Promise.all([
      prisma.boardColumn.findFirst({
        where: { id: input.columnId, boardId: input.boardId },
        select: { id: true },
      }),
      prisma.boardCardType.findFirst({
        where: { id: input.cardTypeId, boardId: input.boardId },
        select: { id: true },
      }),
    ]);
    if (!column) throw new BoardAccessError("That column is not on this board.");
    if (!cardType) throw new BoardAccessError("That card type is not on this board.");

    const card = await prisma.$transaction(async (tx) => {
      // The number counts every card the board has ever held, archived ones
      // included, so a number is never handed out twice.
      const [last, siblings] = await Promise.all([
        tx.boardCard.findFirst({
          where: { boardId: input.boardId },
          orderBy: { cardNumber: "desc" },
          select: { cardNumber: true },
        }),
        tx.boardCard.findMany({
          where: { columnId: input.columnId, archivedAt: null },
          orderBy: { position: "asc" },
          select: { position: true },
        }),
      ]);

      return tx.boardCard.create({
        data: {
          boardId: input.boardId,
          cardNumber: (last?.cardNumber ?? 0) + 1,
          columnId: input.columnId,
          cardTypeId: input.cardTypeId,
          title,
          createdById: context.userId,
          position: positionForIndex(
            siblings.map((row) => row.position),
            siblings.length,
          ),
        },
        select: { id: true },
      });
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return card;
  });
}

export async function updateBoardCard(input: {
  cardId: string;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  cardTypeId?: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  dueDone?: boolean;
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForCard(input.cardId, "editCard");

    const title = input.title?.trim();
    if (input.title !== undefined && !title) {
      throw new BoardAccessError("A card needs a title.");
    }

    // An assignee has to be on the project, since board membership is drawn
    // from it. Anything else would put a name on a card that cannot open it.
    if (input.assigneeId) {
      const member = await prisma.projectMember.findUnique({
        where: {
          userId_projectId: { userId: input.assigneeId, projectId: context.board.projectId },
        },
        select: { id: true },
      });
      if (!member) throw new BoardAccessError("That person is not on this project.");
    }

    if (input.cardTypeId) {
      const cardType = await prisma.boardCardType.findFirst({
        where: { id: input.cardTypeId, boardId },
        select: { id: true },
      });
      if (!cardType) throw new BoardAccessError("That card type is not on this board.");
    }

    // Checked against whichever of the two the caller did not send, so setting
    // one date cannot quietly invert a pair that was fine before.
    if (input.startDate !== undefined || input.dueDate !== undefined) {
      const current = await prisma.boardCard.findUnique({
        where: { id: input.cardId },
        select: { startDate: true, dueDate: true },
      });
      const start = input.startDate !== undefined ? input.startDate : current?.startDate;
      const due = input.dueDate !== undefined ? input.dueDate : current?.dueDate;
      if (start && due && start > due) {
        throw new BoardAccessError("A card cannot be due before it starts.");
      }
    }

    await prisma.boardCard.update({
      where: { id: input.cardId },
      data: {
        ...(title ? { title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        // Changing the type changes which questions the card is asked. Answers
        // to the old type's fields are left where they are rather than deleted:
        // a type switched back should not have lost what was already written.
        ...(input.cardTypeId ? { cardTypeId: input.cardTypeId } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        // Clearing the due date clears the tick with it: "done" with nothing to
        // be done by is a state the UI has no way to show or undo.
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate, ...(input.dueDate ? {} : { dueDone: false }) }
          : {}),
        ...(input.dueDone !== undefined ? { dueDone: input.dueDone } : {}),
      },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

/**
 * Save answers to a card's fields.
 *
 * Blank values delete their row rather than storing an empty string, so
 * "unanswered" has one representation and `missingRequiredFields` does not have
 * to know about two.
 */
export async function setBoardCardFieldValues(input: {
  cardId: string;
  values: Record<string, string>;
}): Promise<BoardResult<{ missingRequired: string[] }>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCard(input.cardId, "editCard");

    const card = await prisma.boardCard.findUnique({
      where: { id: input.cardId },
      select: { cardType: { select: { fields: { orderBy: { position: "asc" } } } } },
    });
    if (!card) throw new BoardAccessError("That card no longer exists.");

    const fields: BoardFieldShape[] = card.cardType.fields;
    const known = new Set(fields.map((field) => field.id));

    const entries = Object.entries(input.values).filter(([fieldId]) => known.has(fieldId));
    const filled = entries.filter(([, value]) => value && value.trim());
    const cleared = entries.filter(([, value]) => !value || !value.trim());

    await prisma.$transaction([
      ...filled.map(([fieldId, value]) =>
        prisma.boardFieldValue.upsert({
          where: { cardId_fieldId: { cardId: input.cardId, fieldId } },
          create: { cardId: input.cardId, fieldId, value },
          update: { value },
        }),
      ),
      ...(cleared.length > 0
        ? [
            prisma.boardFieldValue.deleteMany({
              where: { cardId: input.cardId, fieldId: { in: cleared.map(([id]) => id) } },
            }),
          ]
        : []),
      prisma.boardCard.update({
        where: { id: input.cardId },
        data: { updatedAt: new Date() },
      }),
    ]);

    const saved = await prisma.boardFieldValue.findMany({
      where: { cardId: input.cardId },
      select: { fieldId: true, value: true },
    });
    const values = Object.fromEntries(saved.map((row) => [row.fieldId, row.value]));

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return { missingRequired: missingRequiredFields(fields, values).map((f) => f.id) };
  });
}

/**
 * Move a card, optionally into another column.
 *
 * There is no rule about which column may follow which — that is the whole
 * difference between this and the sprint board, whose `isValidMove` only allows
 * a step to the adjacent stage.
 */
export async function moveBoardCard(input: {
  cardId: string;
  columnId: string;
  index: number;
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForCard(input.cardId, "moveCard");

    const column = await prisma.boardColumn.findFirst({
      where: { id: input.columnId, boardId },
      select: { id: true },
    });
    if (!column) throw new BoardAccessError("That column is not on this board.");

    const siblings = await prisma.boardCard.findMany({
      where: { columnId: input.columnId, archivedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    const changes = planMove(siblings, input.cardId, input.index);

    await prisma.$transaction(
      changes.map((change) =>
        prisma.boardCard.update({
          where: { id: change.id },
          data: {
            position: change.position,
            // Only the card that actually moved changes column; a rebalance
            // rewrites its neighbours' positions and nothing else about them.
            ...(change.id === input.cardId ? { columnId: input.columnId } : {}),
          },
        }),
      ),
    );

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

/** Archived rather than deleted: it leaves the board but keeps its history. */
export async function archiveBoardCard(cardId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCard(cardId, "deleteCard");
    await prisma.boardCard.update({
      where: { id: cardId },
      data: { archivedAt: new Date() },
    });
    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

export async function restoreBoardCard(cardId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCard(cardId, "deleteCard");
    await prisma.boardCard.update({
      where: { id: cardId },
      data: { archivedAt: null },
    });
    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

export async function deleteBoardCard(cardId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCard(cardId, "deleteCard");
    await prisma.boardCard.delete({ where: { id: cardId } });
    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function addBoardCardComment(input: {
  cardId: string;
  content: string;
}): Promise<BoardResult<BoardCardCommentDTO>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCard(input.cardId, "comment");

    const content = input.content.trim();
    if (!content) throw new BoardAccessError("Write something first.");

    const comment = await prisma.boardCardComment.create({
      data: { cardId: input.cardId, userId: context.userId, content },
      include: { user: { select: { id: true, name: true, imageUrl: true } } },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return comment;
  });
}

/** Your own comment, or anybody's if you administer the board. */
export async function deleteBoardCardComment(commentId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const comment = await prisma.boardCardComment.findUnique({
      where: { id: commentId },
      select: { userId: true, card: { select: { boardId: true } } },
    });
    if (!comment) throw new BoardAccessError("That comment no longer exists.");

    const context = await boardContextForBoard(comment.card.boardId);
    const isAuthor = comment.userId === context.userId;
    if (!isAuthor && !canBoard(context.permissions, "manageMembers")) {
      throw new BoardAccessError("You can only delete your own comments.");
    }

    await prisma.boardCardComment.delete({ where: { id: commentId } });
    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

// ─── Labels on a card ────────────────────────────────────────────────────────

/**
 * Put a label on a card, or take it off.
 *
 * Applying is `editCard`, not `manageTypes`: anyone who may edit a card may tag
 * it, while only the board's keepers may invent or recolour a label.
 */
export async function toggleBoardCardLabel(input: {
  cardId: string;
  labelId: string;
  on: boolean;
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForCard(input.cardId, "editCard");

    // Checked against this board, so a caller cannot borrow another board's
    // label to tag a card here with.
    const label = await prisma.boardLabel.findFirst({
      where: { id: input.labelId, boardId },
      select: { id: true },
    });
    if (!label) throw new BoardAccessError("That label is not on this board.");

    if (input.on) {
      // Idempotent: ticking a box that is already ticked is not an error.
      await prisma.boardCardLabel.upsert({
        where: { cardId_labelId: { cardId: input.cardId, labelId: input.labelId } },
        create: { cardId: input.cardId, labelId: input.labelId },
        update: {},
      });
    } else {
      await prisma.boardCardLabel.deleteMany({
        where: { cardId: input.cardId, labelId: input.labelId },
      });
    }

    await prisma.boardCard.update({
      where: { id: input.cardId },
      data: { updatedAt: new Date() },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

// ─── Attachments ─────────────────────────────────────────────────────────────

/**
 * Record a file already in R2 against a card.
 *
 * The bytes went straight from the browser to storage, so this only writes the
 * row that says where they landed — the same split every other upload in the
 * product uses.
 */
export async function addBoardCardAttachment(input: {
  cardId: string;
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string | null;
}): Promise<BoardResult<BoardCardAttachmentDTO>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCard(input.cardId, "editCard");

    const filename = input.filename.trim();
    if (!filename || !input.url) throw new BoardAccessError("That file did not upload.");

    const attachment = await prisma.boardCardAttachment.create({
      data: {
        cardId: input.cardId,
        filename,
        url: input.url,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedById: context.userId,
      },
      include: { uploadedBy: { select: { id: true, name: true, imageUrl: true } } },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return attachment;
  });
}

/**
 * Your own upload, or anybody's if you administer the board — the rule
 * comments already follow.
 *
 * The object is left in R2. Nothing else here deletes stored bytes on the way
 * out either, and a detached file is cheaper than one deleted out from under a
 * link somebody pasted elsewhere.
 */
export async function deleteBoardCardAttachment(
  attachmentId: string,
): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const attachment = await prisma.boardCardAttachment.findUnique({
      where: { id: attachmentId },
      select: { uploadedById: true, card: { select: { boardId: true } } },
    });
    if (!attachment) throw new BoardAccessError("That file is already gone.");

    const context = await boardContextForBoard(attachment.card.boardId);
    const isUploader = attachment.uploadedById === context.userId;
    if (!isUploader && !canBoard(context.permissions, "manageMembers")) {
      throw new BoardAccessError("You can only remove files you attached.");
    }

    await prisma.boardCardAttachment.delete({ where: { id: attachmentId } });
    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}
