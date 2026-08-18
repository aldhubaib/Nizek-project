"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trashHandler } from "@/lib/trash";

export type TrashItemDTO = {
  id: string;
  entityType: string;
  entityId: string;
  label: string;
  sublabel: string | null;
  noun: string;
  href: string;
  deletedAt: string;
  deletedBy: { id: string; name: string | null; email: string; imageUrl: string | null };
};

/**
 * Everything in the trash this user is allowed to see.
 *
 * Items whose row has gone missing are cleared out as they're found: a project
 * deleted outright takes its equity portfolio with it, and the trash shouldn't
 * keep offering to restore something that isn't there.
 */
export async function listTrash(): Promise<TrashItemDTO[]> {
  const user = await requireUser();

  const items = await prisma.trashItem.findMany({
    orderBy: { deletedAt: "desc" },
    include: {
      deletedBy: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
  });

  const visible: TrashItemDTO[] = [];
  const stale: string[] = [];

  for (const item of items) {
    const handler = trashHandler(item.entityType);
    // An unknown type is a handler that was removed — leave the row alone
    // rather than quietly deleting a record of something we can't identify.
    if (!handler) continue;
    if (!(await handler.canView(user.id))) continue;
    if (!(await handler.exists(item.entityId))) {
      stale.push(item.id);
      continue;
    }
    visible.push({
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      label: item.label,
      sublabel: item.sublabel,
      noun: handler.noun,
      href: await handler.href(item.entityId),
      deletedAt: item.deletedAt.toISOString(),
      deletedBy: item.deletedBy,
    });
  }

  if (stale.length > 0) {
    await prisma.trashItem.deleteMany({ where: { id: { in: stale } } });
  }

  return visible;
}

/** How many items the trash is holding for this user — for the nav count. */
export async function getTrashCount(): Promise<number> {
  return (await listTrash()).length;
}

async function itemFor(trashItemId: string, userId: string) {
  const item = await prisma.trashItem.findUnique({ where: { id: trashItemId } });
  if (!item) throw new Error("That item is no longer in the trash");
  const handler = trashHandler(item.entityType);
  if (!handler) throw new Error("Nothing here knows how to handle that item");
  if (!(await handler.canView(userId))) throw new Error("Unauthorized");
  return { item, handler };
}

export async function restoreTrashItem(trashItemId: string) {
  const user = await requireUser();
  const { item, handler } = await itemFor(trashItemId, user.id);

  await handler.restore(item.entityId, user.id);
  await prisma.trashItem.delete({ where: { id: item.id } });

  const href = await handler.href(item.entityId);
  revalidatePath("/dashboard/trash");
  revalidatePath(href);
  revalidatePath("/dashboard/equity");
  revalidatePath("/dashboard/vault");
  return { href };
}

/**
 * Emptying the trash is the only thing that actually deletes, so it's the one
 * step held back for admins — anyone with access to a module can throw its
 * things away and take them back out again.
 */
async function requireAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") {
    throw new Error("Only an admin can permanently delete");
  }
  return user;
}

export async function purgeTrashItem(trashItemId: string) {
  const user = await requireAdmin();
  const { item, handler } = await itemFor(trashItemId, user.id);

  await handler.purge(item.entityId);
  await prisma.trashItem.delete({ where: { id: item.id } });

  revalidatePath("/dashboard/trash");
  revalidatePath("/dashboard/equity");
  revalidatePath("/dashboard/vault");
}

/** Empties everything the admin can see, and reports what it managed to remove. */
export async function emptyTrash(): Promise<{ purged: number }> {
  const user = await requireAdmin();
  const items = await prisma.trashItem.findMany({ orderBy: { deletedAt: "asc" } });

  let purged = 0;
  for (const item of items) {
    const handler = trashHandler(item.entityType);
    if (!handler || !(await handler.canView(user.id))) continue;
    if (await handler.exists(item.entityId)) await handler.purge(item.entityId);
    await prisma.trashItem.delete({ where: { id: item.id } });
    purged += 1;
  }

  revalidatePath("/dashboard/trash");
  revalidatePath("/dashboard/equity");
  revalidatePath("/dashboard/vault");
  return { purged };
}
