import "server-only";
import { prisma } from "@/lib/prisma";
import {
  canAccessEquity,
} from "@/lib/equity-access";
import { logEquityEvent } from "@/lib/equity-activity";
import {
  canManageVaultTrash,
} from "@/lib/vault-access";
import { logVaultEvent } from "@/lib/vault-activity";

/**
 * The trash holds things from anywhere in the app, so it can't know how to undo
 * any particular delete. Each kind of deletable thing registers a handler here
 * instead: how to tell whether it's still there, how to put it back, how to
 * finish the job, and who is allowed to look at it.
 *
 * Adding a new kind is a handler and a `deletedAt` column — no change to the
 * trash page, the actions, or this file's callers.
 */
export type TrashEntityType = "EQUITY_PORTFOLIO" | "VAULT_CREDENTIAL";

type TrashHandler = {
  /** What this kind of thing is called, under the item's own name. */
  noun: string;
  /** Whether the deleted row is still around — a purge elsewhere can beat us. */
  exists: (entityId: string) => Promise<boolean>;
  /** Undo the delete, on behalf of the user asking for it. */
  restore: (entityId: string, userId: string) => Promise<void>;
  /** Delete it for real. */
  purge: (entityId: string) => Promise<void>;
  /** Where it lives again once restored. */
  href: (entityId: string) => string | Promise<string>;
  /**
   * Whether this user may see the item at all. The trash is one list shared by
   * the whole app, so a module's own permissions have to survive the trip into
   * it — equity is private, and stays private after it's deleted.
   * Vault credentials are stricter: only system admins see them in the trash.
   */
  canView: (userId: string) => Promise<boolean>;
};

const HANDLERS: Record<TrashEntityType, TrashHandler> = {
  EQUITY_PORTFOLIO: {
    noun: "Equity portfolio",
    exists: async (id) =>
      (await prisma.equityPortfolio.count({ where: { id } })) > 0,
    restore: async (id, userId) => {
      await prisma.equityPortfolio.update({
        where: { id },
        data: { deletedAt: null },
      });
      await logEquityEvent({
        portfolioId: id,
        userId,
        section: "PORTFOLIO",
        action: "restored",
        label: "Portfolio",
        newValue: "Restored from the trash",
      });
    },
    purge: async (id) => {
      // Everything under a portfolio cascades from this one row: contracts,
      // splits and their grants, tranches, financials, the opportunity and its
      // items, and the history of all of it.
      await prisma.equityPortfolio.delete({ where: { id } });
    },
    href: (id) => `/dashboard/equity/${id}`,
    canView: (userId) => canAccessEquity(userId),
  },
  VAULT_CREDENTIAL: {
    noun: "Vault credential",
    exists: async (id) =>
      (await prisma.vaultCredential.count({ where: { id } })) > 0,
    restore: async (id, userId) => {
      await prisma.vaultCredential.update({
        where: { id },
        data: { deletedAt: null },
      });
      await logVaultEvent({
        credentialId: id,
        userId,
        action: "restored",
        label: "Credential",
        newValue: "Restored from the trash",
      });
    },
    purge: async (id) => {
      await prisma.vaultCredential.delete({ where: { id } });
    },
    href: async (id) => {
      const row = await prisma.vaultCredential.findUnique({
        where: { id },
        select: { projectId: true },
      });
      return row
        ? `/dashboard/projects/${row.projectId}?tab=vault`
        : "/dashboard/vault";
    },
    // Only system admins see vault items in the trash — restore and permanent
    // delete stay with them, even when someone else moved the item there.
    canView: (userId) => canManageVaultTrash(userId),
  },
};

export function trashHandler(entityType: string): TrashHandler | null {
  return HANDLERS[entityType as TrashEntityType] ?? null;
}

/** Records that something was thrown away. The row itself is flagged by caller. */
export async function addToTrash(item: {
  entityType: TrashEntityType;
  entityId: string;
  label: string;
  sublabel?: string | null;
  deletedById: string;
}) {
  const { entityType, entityId } = item;
  // Deleting, restoring and deleting again should read as one item, not a pile.
  await prisma.trashItem.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: {
      entityType,
      entityId,
      label: item.label,
      sublabel: item.sublabel ?? null,
      deletedById: item.deletedById,
    },
    update: {
      label: item.label,
      sublabel: item.sublabel ?? null,
      deletedById: item.deletedById,
      deletedAt: new Date(),
    },
  });
}
