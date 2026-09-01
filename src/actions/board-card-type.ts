"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  BoardAccessError,
  requireBoardAction,
  requireBoardActionForCardType,
  requireBoardActionForField,
  runBoardAction,
  type BoardResult,
} from "@/lib/board-access";
import {
  DEFAULT_BOARD_COLOR,
  DEFAULT_BOARD_ICON,
  isBoardColor,
  isBoardIcon,
} from "@/lib/board-palette";
import { POSITION_STEP, planReorder } from "@/lib/board-order";
import type { BoardCardTypeDTO, BoardFieldDTO } from "@/actions/board";

/**
 * Card types and the fields they ask for.
 *
 * This is the half of the module a board's admin spends time in: a type is a
 * kind of card, and its fields are the questions that kind of card owes an
 * answer to. `required` on a field is the "required vs optional" the board sets
 * per question, and `src/lib/board-fields.ts` is what reads it back.
 */

/** The field types `question-field.tsx` knows how to draw. */
const FIELD_TYPES = ["text", "select", "link", "file"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

function normaliseFieldType(type: string | undefined): FieldType {
  return FIELD_TYPES.includes(type as FieldType) ? (type as FieldType) : "text";
}

/** Options are only meaningful for a select, and are stored as a JSON array. */
function encodeOptions(type: FieldType, options: string[] | undefined): string | null {
  if (type !== "select") return null;
  const cleaned = (options ?? []).map((o) => o.trim()).filter(Boolean);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

// ─── Card types ──────────────────────────────────────────────────────────────

export async function createBoardCardType(input: {
  boardId: string;
  name: string;
  icon?: string;
  color?: string;
}): Promise<BoardResult<BoardCardTypeDTO>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "manageTypes");

    const name = input.name.trim();
    if (!name) throw new BoardAccessError("A card type needs a name.");

    const last = await prisma.boardCardType.findFirst({
      where: { boardId: input.boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const cardType = await prisma.boardCardType.create({
      data: {
        boardId: input.boardId,
        name,
        icon: input.icon && isBoardIcon(input.icon) ? input.icon : DEFAULT_BOARD_ICON,
        color: input.color && isBoardColor(input.color) ? input.color : DEFAULT_BOARD_COLOR,
        position: (last?.position ?? 0) + POSITION_STEP,
      },
      include: { fields: { orderBy: { position: "asc" } } },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return cardType;
  });
}

export async function updateBoardCardType(input: {
  cardTypeId: string;
  name?: string;
  icon?: string;
  color?: string;
}): Promise<BoardResult<BoardCardTypeDTO>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCardType(input.cardTypeId, "manageTypes");

    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BoardAccessError("A card type needs a name.");
    }

    const cardType = await prisma.boardCardType.update({
      where: { id: input.cardTypeId },
      data: {
        ...(name ? { name } : {}),
        ...(input.icon && isBoardIcon(input.icon) ? { icon: input.icon } : {}),
        ...(input.color && isBoardColor(input.color) ? { color: input.color } : {}),
      },
      include: { fields: { orderBy: { position: "asc" } } },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return cardType;
  });
}

/**
 * Refused while cards still use the type, and refused for the last one.
 *
 * Both would leave the board in a state it cannot draw: a card whose type is
 * gone has no fields to render, and a board with no types has nothing to create.
 */
export async function deleteBoardCardType(cardTypeId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context, boardId } = await requireBoardActionForCardType(cardTypeId, "manageTypes");

    const cardCount = await prisma.boardCard.count({ where: { cardTypeId } });
    if (cardCount > 0) {
      throw new BoardAccessError(
        `${cardCount} ${cardCount === 1 ? "card uses" : "cards use"} that type. Change them to another type first.`,
      );
    }

    const remaining = await prisma.boardCardType.count({ where: { boardId } });
    if (remaining <= 1) {
      throw new BoardAccessError("A board needs at least one card type.");
    }

    await prisma.boardCardType.delete({ where: { id: cardTypeId } });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

export async function reorderBoardCardTypes(input: {
  boardId: string;
  orderedIds: string[];
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const context = await requireBoardAction(input.boardId, "manageTypes");

    const owned = await prisma.boardCardType.findMany({
      where: { boardId: input.boardId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((type) => type.id));
    const ordered = input.orderedIds.filter((id) => ownedIds.has(id));

    await prisma.$transaction(
      planReorder(ordered).map((row) =>
        prisma.boardCardType.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

// ─── Fields ──────────────────────────────────────────────────────────────────

export async function createBoardField(input: {
  cardTypeId: string;
  label: string;
  type?: string;
  options?: string[];
  multiple?: boolean;
  required?: boolean;
}): Promise<BoardResult<BoardFieldDTO>> {
  return runBoardAction(async () => {
    // Creating a field is authorised against the type that will own it.
    const { context } = await requireBoardActionForCardType(input.cardTypeId, "manageTypes");

    const label = input.label.trim();
    if (!label) throw new BoardAccessError("A field needs a label.");

    const type = normaliseFieldType(input.type);
    const last = await prisma.boardField.findFirst({
      where: { cardTypeId: input.cardTypeId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const field = await prisma.boardField.create({
      data: {
        cardTypeId: input.cardTypeId,
        label,
        type,
        options: encodeOptions(type, input.options),
        multiple: type === "select" ? (input.multiple ?? false) : false,
        required: input.required ?? false,
        position: (last?.position ?? 0) + POSITION_STEP,
      },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return field;
  });
}

export async function updateBoardField(input: {
  fieldId: string;
  label?: string;
  type?: string;
  options?: string[];
  multiple?: boolean;
  required?: boolean;
}): Promise<BoardResult<BoardFieldDTO>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForField(input.fieldId, "manageTypes");

    const existing = await prisma.boardField.findUnique({
      where: { id: input.fieldId },
      select: { type: true },
    });
    if (!existing) throw new BoardAccessError("That field no longer exists.");

    const label = input.label?.trim();
    if (input.label !== undefined && !label) {
      throw new BoardAccessError("A field needs a label.");
    }

    const type = input.type !== undefined ? normaliseFieldType(input.type) : (existing.type as FieldType);

    const field = await prisma.boardField.update({
      where: { id: input.fieldId },
      data: {
        ...(label ? { label } : {}),
        ...(input.type !== undefined ? { type } : {}),
        ...(input.options !== undefined || input.type !== undefined
          ? { options: encodeOptions(type, input.options) }
          : {}),
        ...(input.multiple !== undefined || input.type !== undefined
          ? { multiple: type === "select" ? (input.multiple ?? false) : false }
          : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
      },
    });

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return field;
  });
}

export async function deleteBoardField(fieldId: string): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForField(fieldId, "manageTypes");
    // Answers go with the question: BoardFieldValue cascades from BoardField, so
    // deleting a field takes what cards said in reply to it.
    await prisma.boardField.delete({ where: { id: fieldId } });
    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}

export async function reorderBoardFields(input: {
  cardTypeId: string;
  orderedIds: string[];
}): Promise<BoardResult<null>> {
  return runBoardAction(async () => {
    const { context } = await requireBoardActionForCardType(input.cardTypeId, "manageTypes");

    const owned = await prisma.boardField.findMany({
      where: { cardTypeId: input.cardTypeId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((field) => field.id));
    const ordered = input.orderedIds.filter((id) => ownedIds.has(id));

    await prisma.$transaction(
      planReorder(ordered).map((row) =>
        prisma.boardField.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );

    revalidatePath(`/dashboard/projects/${context.board.projectId}`);
    return null;
  });
}