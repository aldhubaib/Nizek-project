import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Vault access is granted per user per project. Unlike project membership,
 * this is a separate permission — being on the Team tab does not open Vault.
 * System admins are not implicit (same rule as Equity): grant access explicitly
 * in Admin → Vault Access, including to yourself.
 */
export async function canAccessProjectVault(
  userId: string | null | undefined,
  projectId: string,
): Promise<boolean> {
  if (!userId) return false;
  const count = await prisma.vaultPermission.count({
    where: { userId, projectId },
  });
  return count > 0;
}

/** Any vault grant at all — used for the global Vault nav entry. */
export async function canAccessAnyVault(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const count = await prisma.vaultPermission.count({ where: { userId } });
  return count > 0;
}

export async function listVaultProjectIds(
  userId: string,
): Promise<string[]> {
  const rows = await prisma.vaultPermission.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

/** Vault trash is admin-only — restore / purge stay with system admins. */
export async function canManageVaultTrash(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  });
  return user?.systemRole === "ADMIN";
}
