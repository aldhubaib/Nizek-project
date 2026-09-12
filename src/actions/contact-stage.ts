"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireContactsAccess } from "@/lib/contacts-access";
import { isBoardColor, DEFAULT_BOARD_COLOR } from "@/lib/board-palette";
import { planReorder, positionBetween } from "@/lib/board-order";

export type ContactStageDTO = {
  id: string;
  name: string;
  color: string;
  position: number;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_NAME = 40;

async function stageAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[contact-stage:${label}]`, err);
    return { ok: false, error };
  }
}

function cleanName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new Error("Column name is required");
  if (name.length > MAX_NAME) {
    throw new Error(`Keep the name under ${MAX_NAME} characters`);
  }
  return name;
}

/** Unknown colours fall back rather than render an uncoloured column. */
function cleanColor(raw: string | null | undefined): string {
  const color = raw?.trim();
  return color && isBoardColor(color) ? color : DEFAULT_BOARD_COLOR;
}

function toDTO(row: {
  id: string;
  name: string;
  color: string;
  position: number;
}): ContactStageDTO {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    position: row.position,
  };
}

export async function listContactStages(): Promise<ContactStageDTO[]> {
  await requireContactsAccess();
  const rows = await prisma.contactStage.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true, color: true, position: true },
  });
  return rows.map(toDTO);
}

/** Appends a column to the right-hand end of the board. */
export async function createContactStage(input: {
  name: string;
  color?: string;
}): Promise<ActionResult<ContactStageDTO>> {
  return stageAction("create", async () => {
    await requireContactsAccess();
    const name = cleanName(input.name);

    const clash = await prisma.contactStage.findUnique({
      where: { name },
      select: { id: true },
    });
    if (clash) throw new Error(`There is already a “${name}” column`);

    const last = await prisma.contactStage.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const created = await prisma.contactStage.create({
      data: {
        name,
        color: cleanColor(input.color),
        position: positionBetween(last?.position ?? null, null),
      },
      select: { id: true, name: true, color: true, position: true },
    });

    revalidatePath("/dashboard/contacts");
    return toDTO(created);
  });
}

export async function updateContactStage(
  id: string,
  input: { name: string; color?: string },
): Promise<ActionResult<ContactStageDTO>> {
  return stageAction("update", async () => {
    await requireContactsAccess();
    const name = cleanName(input.name);

    const clash = await prisma.contactStage.findUnique({
      where: { name },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      throw new Error(`There is already a “${name}” column`);
    }

    const updated = await prisma.contactStage.update({
      where: { id },
      data: { name, color: cleanColor(input.color) },
      select: { id: true, name: true, color: true, position: true },
    });

    revalidatePath("/dashboard/contacts");
    return toDTO(updated);
  });
}

/**
 * Deletes a column. Its contacts are not deleted with it — the foreign key
 * clears, so they reappear under "Unassigned" and can be dragged somewhere
 * else. The count comes back so the caller can say what happened.
 */
export async function deleteContactStage(
  id: string,
): Promise<ActionResult<{ id: string; unassignedContacts: number }>> {
  return stageAction("delete", async () => {
    await requireContactsAccess();
    const existing = await prisma.contactStage.findUnique({
      where: { id },
      select: { _count: { select: { contacts: true } } },
    });
    if (!existing) throw new Error("That column no longer exists");

    await prisma.contactStage.delete({ where: { id } });

    revalidatePath("/dashboard/contacts");
    return { id, unassignedContacts: existing._count.contacts };
  });
}

/**
 * Rewrites the column order from the full list of ids, left to right.
 *
 * Stating the whole order rather than "move X to index N" keeps the server from
 * having to guess what the client was looking at, and `planReorder` respaces
 * the positions so repeated drags can never run the gaps down.
 */
export async function reorderContactStages(
  orderedIds: string[],
): Promise<ActionResult<ContactStageDTO[]>> {
  return stageAction("reorder", async () => {
    await requireContactsAccess();

    const existing = await prisma.contactStage.findMany({
      select: { id: true },
    });
    const known = new Set(existing.map((s) => s.id));
    // A stale board could name a column somebody else deleted, or omit one they
    // added. Either way the order it sent is not a description of the board any
    // more, so refuse it rather than writing a partial order.
    if (
      orderedIds.length !== known.size ||
      orderedIds.some((id) => !known.has(id)) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      throw new Error("The board changed — reload and try again");
    }

    const plan = planReorder(orderedIds);
    await prisma.$transaction(
      plan.map((row) =>
        prisma.contactStage.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );

    revalidatePath("/dashboard/contacts");
    return listContactStages();
  });
}

/**
 * Drops a contact into a column, or out of every column when `stageId` is null.
 *
 * There is no position to write: cards are sorted by name inside a column, so
 * where in the column it was dropped does not matter.
 */
export async function moveContactToStage(
  contactId: string,
  stageId: string | null,
): Promise<ActionResult<{ id: string; stageId: string | null }>> {
  return stageAction("move", async () => {
    await requireContactsAccess();

    if (stageId) {
      const exists = await prisma.contactStage.count({ where: { id: stageId } });
      if (!exists) throw new Error("That column no longer exists");
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: { stageId },
    });

    revalidatePath("/dashboard/contacts");
    return { id: contactId, stageId };
  });
}
