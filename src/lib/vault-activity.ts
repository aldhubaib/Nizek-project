import "server-only";
import { prisma } from "@/lib/prisma";

export type VaultAction =
  | "created"
  | "updated"
  | "deleted"
  | "restored"
  | "revealed";

export type VaultChange = {
  label: string;
  old: string | null;
  new: string | null;
};

export async function logVaultChanges(entry: {
  credentialId: string;
  userId: string;
  action: VaultAction;
  changes: VaultChange[];
}) {
  if (entry.changes.length === 0) return;
  await prisma.vaultActivity.createMany({
    data: entry.changes.map((change) => ({
      credentialId: entry.credentialId,
      userId: entry.userId,
      action: entry.action,
      label: change.label,
      oldValue: change.old,
      newValue: change.new,
    })),
  });
}

export async function logVaultEvent(entry: {
  credentialId: string;
  userId: string;
  action: VaultAction;
  label?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await prisma.vaultActivity.create({
    data: {
      credentialId: entry.credentialId,
      userId: entry.userId,
      action: entry.action,
      label: entry.label ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
    },
  });
}
