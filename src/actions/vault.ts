"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addToTrash } from "@/lib/trash";
import {
  canAccessAnyVault,
  canAccessProjectVault,
  listVaultProjectIds,
} from "@/lib/vault-access";
import { logVaultChanges, logVaultEvent } from "@/lib/vault-activity";
import {
  decryptVaultSecret,
  encryptVaultSecret,
  SECRET_MASK,
} from "@/lib/vault-crypto";

export type VaultCredentialDTO = {
  id: string;
  projectId: string;
  projectName: string;
  folderId: string | null;
  folderName: string | null;
  title: string;
  username: string | null;
  hasPassword: boolean;
  url: string | null;
  hasNotes: boolean;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
};

export type VaultFolderDTO = {
  id: string;
  name: string;
  credentialCount: number;
};

export type VaultActivityDTO = {
  id: string;
  action: string;
  label: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string | null; imageUrl: string | null };
};

export type VaultMember = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
};

const CATEGORIES = new Set(["LOGIN", "EMAIL", "API_KEY", "OTHER"]);

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function vaultAction<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    console.error(`[vault:${label}]`, err);
    if (error.includes("VAULT_ENCRYPTION_KEY") || error.includes("not configured")) {
      return {
        ok: false,
        error:
          "Vault encryption is not configured. Ask an admin to set VAULT_ENCRYPTION_KEY and restart the app.",
      };
    }
    if (error === "Unauthorized") {
      return { ok: false, error: "You don't have vault access for this project." };
    }
    return { ok: false, error };
  }
}

async function logVaultQuietly(
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("[vault] activity log failed", err);
  }
}

function toDTO(row: {
  id: string;
  projectId: string;
  title: string;
  username: string | null;
  passwordEnc: string | null;
  url: string | null;
  notesEnc: string | null;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
  project: { name: string };
  folder: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
}): VaultCredentialDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    folderId: row.folder?.id ?? null,
    folderName: row.folder?.name ?? null,
    title: row.title,
    username: row.username,
    hasPassword: Boolean(row.passwordEnc),
    url: row.url,
    hasNotes: Boolean(row.notesEnc),
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
  };
}

const CREDENTIAL_INCLUDE = {
  project: { select: { name: true } },
  folder: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, imageUrl: true } },
} as const;

const FOLDER_NAME_MAX = 40;

function normalizeFolderName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Folder name is required");
  if (name.length > FOLDER_NAME_MAX) {
    throw new Error(`Folder name must be ${FOLDER_NAME_MAX} characters or fewer`);
  }
  return name;
}

async function assertUniqueFolderName(
  projectId: string,
  name: string,
  excludeId?: string,
) {
  const existing = await prisma.vaultFolder.findMany({
    where: { projectId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { name: true },
  });
  if (existing.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A folder with that name already exists");
  }
}

async function resolveFolderId(
  projectId: string,
  folderId: string | null | undefined,
): Promise<string | null> {
  if (!folderId) return null;
  const folder = await prisma.vaultFolder.findFirst({
    where: { id: folderId, projectId },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder not found");
  return folder.id;
}

async function requireVaultAccess(projectId: string) {
  const user = await requireUser();
  if (!(await canAccessProjectVault(user.id, projectId))) {
    throw new Error("Unauthorized");
  }
  return user;
}

function normalizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  return CATEGORIES.has(value) ? value : "OTHER";
}

function fieldDiff(
  label: string,
  before: string | null | undefined,
  after: string | null | undefined,
): { label: string; old: string | null; new: string | null } | null {
  const a = before?.trim() || null;
  const b = after?.trim() || null;
  if (a === b) return null;
  return { label, old: a, new: b };
}

/** Credentials for one project (project Vault tab). */
export async function listProjectVaultCredentials(
  projectId: string,
): Promise<VaultCredentialDTO[]> {
  await requireVaultAccess(projectId);
  const rows = await prisma.vaultCredential.findMany({
    where: { projectId, deletedAt: null },
    include: CREDENTIAL_INCLUDE,
    orderBy: { title: "asc" },
  });
  return rows.map(toDTO);
}

/** All credentials across projects the user has vault access to. */
export async function listAllVaultCredentials(): Promise<VaultCredentialDTO[]> {
  const user = await requireUser();
  if (!(await canAccessAnyVault(user.id))) throw new Error("Unauthorized");

  const projectIds = await listVaultProjectIds(user.id);
  if (projectIds.length === 0) return [];

  const rows = await prisma.vaultCredential.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    include: CREDENTIAL_INCLUDE,
    orderBy: [{ project: { name: "asc" } }, { title: "asc" }],
  });
  return rows.map(toDTO);
}

export type VaultProjectFolderDTO = {
  id: string;
  name: string;
  logoUrl: string | null;
  credentialCount: number;
};

/** Projects the user can open in Vault — including empty folders. */
export async function listVaultProjectFolders(): Promise<VaultProjectFolderDTO[]> {
  const user = await requireUser();
  if (!(await canAccessAnyVault(user.id))) throw new Error("Unauthorized");

  const projectIds = await listVaultProjectIds(user.id);
  if (projectIds.length === 0) return [];

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      _count: {
        select: { vaultCredentials: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    logoUrl: p.logoUrl,
    credentialCount: p._count.vaultCredentials,
  }));
}

export async function listVaultFolders(
  projectId: string,
): Promise<VaultFolderDTO[]> {
  await requireVaultAccess(projectId);
  const rows = await prisma.vaultFolder.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      _count: {
        select: { credentials: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    credentialCount: row._count.credentials,
  }));
}

export async function createVaultFolder(
  projectId: string,
  name: string,
): Promise<ActionResult<VaultFolderDTO>> {
  return vaultAction("create-folder", async () => {
    const user = await requireVaultAccess(projectId);
    const folderName = normalizeFolderName(name);
    await assertUniqueFolderName(projectId, folderName);

    const row = await prisma.vaultFolder.create({
      data: {
        projectId,
        name: folderName,
        createdById: user.id,
      },
    });

    revalidatePath("/dashboard/vault");
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { id: row.id, name: row.name, credentialCount: 0 };
  });
}

export async function renameVaultFolder(
  id: string,
  name: string,
): Promise<ActionResult<VaultFolderDTO>> {
  return vaultAction("rename-folder", async () => {
    const existing = await prisma.vaultFolder.findUnique({ where: { id } });
    if (!existing) throw new Error("Folder not found");
    await requireVaultAccess(existing.projectId);

    const folderName = normalizeFolderName(name);
    await assertUniqueFolderName(existing.projectId, folderName, id);

    const row = await prisma.vaultFolder.update({
      where: { id },
      data: { name: folderName },
      select: {
        id: true,
        name: true,
        _count: {
          select: { credentials: { where: { deletedAt: null } } },
        },
      },
    });

    revalidatePath("/dashboard/vault");
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
    return {
      id: row.id,
      name: row.name,
      credentialCount: row._count.credentials,
    };
  });
}

/** Deletes the folder. Credentials stay and become unfiled. */
export async function deleteVaultFolder(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return vaultAction("delete-folder", async () => {
    const existing = await prisma.vaultFolder.findUnique({ where: { id } });
    if (!existing) throw new Error("Folder not found");
    await requireVaultAccess(existing.projectId);

    await prisma.vaultFolder.delete({ where: { id } });

    revalidatePath("/dashboard/vault");
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
    return { id };
  });
}

export async function createVaultCredential(input: {
  projectId: string;
  title: string;
  username?: string | null;
  password?: string | null;
  url?: string | null;
  notes?: string | null;
  category?: string | null;
  folderId?: string | null;
}): Promise<ActionResult<VaultCredentialDTO>> {
  return vaultAction("create", async () => {
    const user = await requireVaultAccess(input.projectId);
    const title = input.title.trim();
    if (!title) throw new Error("Title is required");

    const password = input.password?.trim() || null;
    const notes = input.notes?.trim() || null;
    const folderId = await resolveFolderId(input.projectId, input.folderId);

    const row = await prisma.vaultCredential.create({
      data: {
        projectId: input.projectId,
        folderId,
        title,
        username: input.username?.trim() || null,
        passwordEnc: password ? encryptVaultSecret(password) : null,
        url: input.url?.trim() || null,
        notesEnc: notes ? encryptVaultSecret(notes) : null,
        category: normalizeCategory(input.category),
        createdById: user.id,
      },
      include: CREDENTIAL_INCLUDE,
    });

    await logVaultQuietly(() =>
      logVaultEvent({
        credentialId: row.id,
        userId: user.id,
        action: "created",
        label: "Credential",
        newValue: title,
      }),
    );

    revalidatePath("/dashboard/vault");
    revalidatePath(`/dashboard/projects/${input.projectId}`);
    return toDTO(row);
  });
}

export async function updateVaultCredential(
  id: string,
  input: {
    title?: string;
    username?: string | null;
    password?: string | null;
    url?: string | null;
    notes?: string | null;
    category?: string | null;
    folderId?: string | null;
    /** When true, clear the password even if password is empty. */
    clearPassword?: boolean;
    clearNotes?: boolean;
  },
): Promise<ActionResult<VaultCredentialDTO>> {
  return vaultAction("update", async () => {
    const existing = await prisma.vaultCredential.findUnique({
      where: { id },
      include: { folder: { select: { name: true } } },
    });
    if (!existing || existing.deletedAt) throw new Error("Credential not found");

    const user = await requireVaultAccess(existing.projectId);

    const title =
      input.title !== undefined ? input.title.trim() : existing.title;
    if (!title) throw new Error("Title is required");

    const username =
      input.username !== undefined
        ? input.username?.trim() || null
        : existing.username;
    const url =
      input.url !== undefined ? input.url?.trim() || null : existing.url;
    const category =
      input.category !== undefined
        ? normalizeCategory(input.category)
        : existing.category;

    const folderId =
      input.folderId !== undefined
        ? await resolveFolderId(existing.projectId, input.folderId)
        : existing.folderId;

    let nextFolderName = existing.folder?.name ?? null;
    if (folderId !== existing.folderId) {
      if (folderId) {
        const folder = await prisma.vaultFolder.findUnique({
          where: { id: folderId },
          select: { name: true },
        });
        nextFolderName = folder?.name ?? null;
      } else {
        nextFolderName = null;
      }
    }

    let passwordEnc = existing.passwordEnc;
    let passwordChanged = false;
    if (input.clearPassword) {
      passwordEnc = null;
      passwordChanged = Boolean(existing.passwordEnc);
    } else if (input.password != null && input.password.trim()) {
      passwordEnc = encryptVaultSecret(input.password.trim());
      passwordChanged = true;
    }

    let notesEnc = existing.notesEnc;
    let notesChanged = false;
    if (input.clearNotes) {
      notesEnc = null;
      notesChanged = Boolean(existing.notesEnc);
    } else if (input.notes !== undefined) {
      const notes = (input.notes ?? "").trim() || null;
      if (notes) {
        notesEnc = encryptVaultSecret(notes);
        notesChanged = true;
      } else if (existing.notesEnc) {
        notesEnc = null;
        notesChanged = true;
      }
    }

    const changes = [
      fieldDiff("Title", existing.title, title),
      fieldDiff("Username / email", existing.username, username),
      fieldDiff("URL", existing.url, url),
      fieldDiff("Category", existing.category, category),
      fieldDiff("Folder", existing.folder?.name, nextFolderName),
    ].filter(Boolean) as { label: string; old: string | null; new: string | null }[];

    if (passwordChanged) {
      changes.push({
        label: "Password",
        old: existing.passwordEnc ? SECRET_MASK : null,
        new: passwordEnc ? SECRET_MASK : null,
      });
    }
    if (notesChanged) {
      changes.push({
        label: "Notes",
        old: existing.notesEnc ? SECRET_MASK : null,
        new: notesEnc ? SECRET_MASK : null,
      });
    }

    const row = await prisma.vaultCredential.update({
      where: { id },
      data: { title, username, url, category, folderId, passwordEnc, notesEnc },
      include: CREDENTIAL_INCLUDE,
    });

    await logVaultQuietly(() =>
      logVaultChanges({
        credentialId: id,
        userId: user.id,
        action: "updated",
        changes,
      }),
    );

    revalidatePath("/dashboard/vault");
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
    return toDTO(row);
  });
}

/**
 * Reveal a secret for copy/display. Logs who revealed it. Password/notes stay
 * encrypted in the DB — only the response carries plaintext.
 */
export async function revealVaultSecret(
  id: string,
  field: "password" | "notes",
): Promise<ActionResult<{ value: string | null }>> {
  return vaultAction("reveal", async () => {
    const existing = await prisma.vaultCredential.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new Error("Credential not found");

    const user = await requireVaultAccess(existing.projectId);
    const enc = field === "password" ? existing.passwordEnc : existing.notesEnc;
    const value = enc ? decryptVaultSecret(enc) : null;

    await logVaultQuietly(() =>
      logVaultEvent({
        credentialId: id,
        userId: user.id,
        action: "revealed",
        label: field === "password" ? "Password" : "Notes",
        newValue: "Revealed",
      }),
    );

    return { value };
  });
}

/** Soft-delete → trash. Only system admins can restore or permanently delete. */
export async function deleteVaultCredential(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  return vaultAction("delete", async () => {
    const existing = await prisma.vaultCredential.findUnique({
      where: { id },
      include: { project: { select: { name: true } } },
    });
    if (!existing || existing.deletedAt) throw new Error("Credential not found");

    const user = await requireVaultAccess(existing.projectId);

    await prisma.vaultCredential.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await addToTrash({
      entityType: "VAULT_CREDENTIAL",
      entityId: id,
      label: existing.title,
      sublabel: existing.project.name,
      deletedById: user.id,
    });

    await logVaultQuietly(() =>
      logVaultEvent({
        credentialId: id,
        userId: user.id,
        action: "deleted",
        label: "Credential",
        newValue: "Moved to the trash",
      }),
    );

    revalidatePath("/dashboard/vault");
    revalidatePath("/dashboard/trash");
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
    return { id };
  });
}

export async function getVaultActivity(
  credentialId: string,
): Promise<VaultActivityDTO[]> {
  const existing = await prisma.vaultCredential.findUnique({
    where: { id: credentialId },
  });
  if (!existing) throw new Error("Credential not found");
  // History is readable for active credentials with vault access, and for
  // admins reviewing a trashed item via the trash restore flow we still require
  // vault access on that project (admins must grant themselves).
  await requireVaultAccess(existing.projectId);

  const rows = await prisma.vaultActivity.findMany({
    where: { credentialId },
    include: {
      user: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    label: r.label,
    oldValue: r.oldValue,
    newValue: r.newValue,
    createdAt: r.createdAt.toISOString(),
    user: r.user,
  }));
}

// ─── Admin: Vault Access ─────────────────────────────────────────────────────

export async function getVaultPermissionAdminData(): Promise<{
  members: VaultMember[];
  projects: { id: string; name: string }[];
  grants: { userId: string; projectIds: string[] }[];
}> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");

  const [members, projects, permissions] = await Promise.all([
    prisma.user.findMany({
      where: { blocked: false, systemRole: { not: "CLIENT" } },
      select: { id: true, name: true, email: true, imageUrl: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.vaultPermission.findMany({
      select: { userId: true, projectId: true },
    }),
  ]);

  const byUser = new Map<string, string[]>();
  for (const p of permissions) {
    const list = byUser.get(p.userId) ?? [];
    list.push(p.projectId);
    byUser.set(p.userId, list);
  }

  return {
    members,
    projects,
    grants: [...byUser.entries()].map(([userId, projectIds]) => ({
      userId,
      projectIds,
    })),
  };
}

/** Replace one user's project vault grants with the given list. */
export async function setUserVaultProjects(
  userId: string,
  projectIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireUser();
  if (admin.systemRole !== "ADMIN") return { ok: false, error: "Admin only" };

  const unique = [...new Set(projectIds)];

  await prisma.$transaction(async (tx) => {
    await tx.vaultPermission.deleteMany({ where: { userId } });
    if (unique.length > 0) {
      await tx.vaultPermission.createMany({
        data: unique.map((projectId) => ({
          userId,
          projectId,
          grantedById: admin.id,
        })),
      });
    }
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/", "layout");
  revalidatePath("/dashboard/vault");
  return { ok: true };
}
