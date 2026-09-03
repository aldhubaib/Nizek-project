"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateR2Key, uploadToR2, deleteFromR2 } from "@/lib/r2";
import {
  APP_SETTINGS_ID,
  aliasesEnabled,
  claimAliasForMember,
  isAliasPoolExhausted,
  needsAlias,
} from "@/lib/alias";
import {
  MAX_NAME_LENGTH,
  nameKeyParts,
  normalizeNationality,
} from "@/lib/alias-import";
import type { Gender } from "@/generated/prisma/client";

const MAX_ALIAS_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
/** Keeps one paste from becoming an unbounded insert. */
const MAX_BULK_ROWS = 1000;

export type AliasDTO = {
  id: string;
  name: string;
  gender: Gender;
  nationality: string | null;
  imageUrl: string | null;
  active: boolean;
  /** Set when this alias is already spoken for, so the UI can lock the row. */
  assignedTo: { userName: string; projectName: string } | null;
};

export type AliasUsageDTO = {
  id: string;
  aliasName: string;
  aliasImageUrl: string | null;
  gender: Gender;
  userId: string;
  userName: string;
  userImageUrl: string | null;
  projectId: string;
  projectName: string;
  /**
   * The alias is held but not in effect: this project shows the person to its
   * client by real name. Kept visible so the list is not read as "the client
   * sees this alias".
   */
  showRealName: boolean;
  createdAt: string;
};

export type AliasStatsDTO = {
  availableMale: number;
  availableFemale: number;
  assignedCount: number;
  /** Memberships that should carry an alias (gender recorded, not excluded). */
  claimableCount: number;
  /** Project members who can never be aliased until an admin records a gender. */
  missingGender: { userId: string; userName: string; projectNames: string[] }[];
  /** Members who should have an alias on a project but don't yet. */
  unaliased: { userId: string; userName: string; projectId: string; projectName: string }[];
};

async function requireAliasAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");
  return user;
}

function parseGender(value: unknown): Gender {
  if (value === "MALE" || value === "FEMALE") return value;
  throw new Error("Gender must be MALE or FEMALE");
}

// ─── The master switch ───────────────────────────────────────────────────────

export type AliasSwitchDTO = {
  enabled: boolean;
  /** When it was last flipped, or null if it has never been touched. */
  changedAt: string | null;
};

export async function getAliasSwitch(): Promise<AliasSwitchDTO> {
  await requireAliasAdmin();
  const row = await prisma.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
    select: { aliasesEnabled: true, updatedAt: true },
  });
  return {
    enabled: row?.aliasesEnabled ?? true,
    changedAt: row ? row.updatedAt.toISOString() : null,
  };
}

/**
 * Turn the whole alias mechanism on or off.
 *
 * Off stops two things at once: clients stop seeing aliases in place of real
 * names, and nobody is handed an alias when they join a project. Assignments
 * already made are deliberately left in the table — an alias a client has
 * already learned belongs to that person for good, so switching back on has to
 * restore the identities clients saw rather than reshuffling them.
 *
 * Every client-facing surface is revalidated, since masking is decided server
 * side and cached pages would otherwise keep serving the old identities.
 */
export async function setAliasesEnabled(enabled: boolean): Promise<void> {
  const admin = await requireAliasAdmin();

  await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID, aliasesEnabled: enabled, updatedById: admin.id },
    update: { aliasesEnabled: enabled, updatedById: admin.id },
  });

  revalidatePath("/dashboard", "layout");
}

// ─── Pool CRUD ───────────────────────────────────────────────────────────────

export async function getAliases(): Promise<AliasDTO[]> {
  await requireAliasAdmin();
  const rows = await prisma.alias.findMany({
    orderBy: [{ gender: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      gender: true,
      nationality: true,
      imageUrl: true,
      active: true,
      assignment: {
        select: {
          user: { select: { name: true, email: true } },
          project: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    gender: a.gender,
    nationality: a.nationality,
    imageUrl: a.imageUrl,
    active: a.active,
    assignedTo: a.assignment
      ? {
          userName: a.assignment.user.name ?? a.assignment.user.email,
          projectName: a.assignment.project.name,
        }
      : null,
  }));
}

/**
 * Create many photo-less aliases from a pasted list. Names and photos are
 * decoupled on purpose: stocking the pool by name is the bottleneck, and a
 * photo can be attached to any row later.
 *
 * Skips names that already exist rather than failing the batch, so an admin can
 * paste an updated list repeatedly without hunting for what is new.
 *
 * First and last names are unique pool-wide, and this is the check that counts:
 * the paste preview runs the same rule client-side, but only the pool read here
 * sees aliases added since that preview was rendered.
 */
export async function createAliasesBulk(
  rows: { name: string; gender: Gender; nationality?: string | null }[],
): Promise<
  | { error: string }
  | { created: number; skipped: { name: string; reason: string }[] }
> {
  await requireAliasAdmin();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: "Nothing to import" };
  }
  if (rows.length > MAX_BULK_ROWS) {
    return { error: `Import at most ${MAX_BULK_ROWS} aliases at a time` };
  }

  const clean: { name: string; gender: Gender; nationality: string | null }[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const row of rows) {
    const name = String(row?.name ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) {
      skipped.push({ name: "(blank)", reason: "No name" });
      continue;
    }
    // The paste preview checks this too, but the action is reachable directly.
    if (name.length > MAX_NAME_LENGTH) {
      skipped.push({
        name: name.slice(0, 40),
        reason: `Longer than ${MAX_NAME_LENGTH} characters`,
      });
      continue;
    }
    let gender: Gender;
    try {
      gender = parseGender(row?.gender);
    } catch {
      skipped.push({ name, reason: "Gender must be male or female" });
      continue;
    }
    clean.push({ name, gender, nationality: normalizeNationality(row?.nationality) });
  }

  if (clean.length === 0) return { created: 0, skipped };

  // Whole pool, not just the pasted names: uniqueness is enforced on each half
  // of the name, so a row can clash with an alias whose full name differs.
  const pool = await prisma.alias.findMany({ select: { name: true } });
  const takenFull = new Set(pool.map((a) => a.name.toLowerCase()));
  const takenFirst = new Map<string, string>();
  const takenLast = new Map<string, string>();
  for (const a of pool) {
    const { first, last } = nameKeyParts(a.name);
    if (first && !takenFirst.has(first)) takenFirst.set(first, a.name);
    if (last && !takenLast.has(last)) takenLast.set(last, a.name);
  }

  const toCreate = clean.filter((r) => {
    const lower = r.name.toLowerCase();
    if (takenFull.has(lower)) {
      skipped.push({ name: r.name, reason: "Already in the pool" });
      return false;
    }

    const { first, last } = nameKeyParts(r.name);
    const firstOwner = takenFirst.get(first);
    if (firstOwner) {
      skipped.push({
        name: r.name,
        reason: `First name is already used by "${firstOwner}"`,
      });
      return false;
    }
    const lastOwner = takenLast.get(last);
    if (lastOwner) {
      skipped.push({
        name: r.name,
        reason: `Last name is already used by "${lastOwner}"`,
      });
      return false;
    }

    takenFull.add(lower);
    takenFirst.set(first, r.name);
    takenLast.set(last, r.name);
    return true;
  });

  if (toCreate.length === 0) return { created: 0, skipped };

  const result = await prisma.alias.createMany({ data: toCreate });

  revalidatePath("/dashboard/admin");
  return { created: result.count, skipped };
}

/**
 * Returns the reason `name` cannot be used, or null when it is free. Compares
 * against every other alias because uniqueness covers each half of the name.
 */
async function findNameClash(name: string, exceptId: string): Promise<string | null> {
  const { first, last } = nameKeyParts(name);
  const others = await prisma.alias.findMany({
    where: { id: { not: exceptId } },
    select: { name: true },
  });

  for (const other of others) {
    if (other.name.toLowerCase() === name.toLowerCase()) {
      return `"${other.name}" is already an alias`;
    }
  }
  for (const other of others) {
    const parts = nameKeyParts(other.name);
    if (parts.first === first) {
      return `First name is already used by "${other.name}"`;
    }
    if (parts.last === last) {
      return `Last name is already used by "${other.name}"`;
    }
  }
  return null;
}

export async function updateAlias(input: {
  id: string;
  name?: string;
  gender?: Gender;
  nationality?: string | null;
  active?: boolean;
}): Promise<{ error: string } | { success: true }> {
  await requireAliasAdmin();

  const data: {
    name?: string;
    gender?: Gender;
    nationality?: string | null;
    active?: boolean;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.replace(/\s+/g, " ").trim();
    if (!name) return { error: "Name is required" };
    if (name.length > MAX_NAME_LENGTH) {
      return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` };
    }

    // Renaming is the other way a duplicate half-name could get into the pool,
    // so it answers to the same rule the bulk import does.
    const clash = await findNameClash(name, input.id);
    if (clash) return { error: clash };

    data.name = name;
  }

  // Unlike gender, nationality is never shown to a client, so it stays editable
  // after the alias is claimed.
  if (input.nationality !== undefined) {
    data.nationality = normalizeNationality(input.nationality);
  }

  if (input.gender !== undefined) {
    const assigned = await prisma.aliasAssignment.findUnique({
      where: { aliasId: input.id },
      select: { id: true },
    });
    // Changing gender on a live alias would put a man's alias on a woman (or
    // vice versa) in a client's chat history.
    if (assigned) return { error: "Cannot change gender while this alias is in use" };
    data.gender = input.gender;
  }

  if (input.active !== undefined) data.active = input.active;

  await prisma.alias.update({ where: { id: input.id }, data });
  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function replaceAliasPhoto(
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  await requireAliasAdmin();

  const id = String(formData.get("id") ?? "");
  const file = formData.get("file");
  if (!id) return { error: "Missing alias" };
  if (!(file instanceof File) || file.size === 0) return { error: "No image provided" };
  if (!file.type.startsWith("image/")) return { error: "Only image files are allowed" };
  if (file.size > MAX_ALIAS_PHOTO_BYTES) {
    return {
      error: `Image is too large. Maximum is ${MAX_ALIAS_PHOTO_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const existing = await prisma.alias.findUnique({
    where: { id },
    select: { r2Key: true },
  });
  if (!existing) return { error: "Alias not found" };

  const key = generateR2Key("alias_photo", file.name || "alias.jpg");
  const bytes = Buffer.from(await file.arrayBuffer());
  const url = await uploadToR2(bytes, key, file.type || "application/octet-stream");

  await prisma.alias.update({
    where: { id },
    data: { imageUrl: url, r2Key: key, contentType: file.type || null },
  });
  if (existing.r2Key) await deleteFromR2(existing.r2Key).catch(() => {});

  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function deleteAlias(
  id: string,
): Promise<{ error: string } | { success: true }> {
  await requireAliasAdmin();

  const alias = await prisma.alias.findUnique({
    where: { id },
    select: {
      r2Key: true,
      assignment: {
        select: {
          user: { select: { name: true, email: true } },
          project: { select: { name: true } },
        },
      },
    },
  });
  if (!alias) return { error: "Alias not found" };
  if (alias.assignment) {
    const who = alias.assignment.user.name ?? alias.assignment.user.email;
    return {
      error: `In use by ${who} on ${alias.assignment.project.name}. Deactivate it instead.`,
    };
  }

  await prisma.alias.delete({ where: { id } });
  if (alias.r2Key) await deleteFromR2(alias.r2Key).catch(() => {});

  revalidatePath("/dashboard/admin");
  return { success: true };
}

/**
 * Re-randomise the draw order of every unclaimed alias.
 *
 * New aliases already get a random key from the database, so this is only
 * needed to re-roll an existing pool — after a large ordered import, or if an
 * admin simply wants a different sequence. Claimed aliases are left alone since
 * they are never drawn again.
 */
export async function reshuffleAliasPool(): Promise<{ reshuffled: number }> {
  await requireAliasAdmin();

  const reshuffled = await prisma.$executeRaw`
    UPDATE "Alias"
    SET "shuffleKey" = random()
    WHERE NOT EXISTS (
      SELECT 1 FROM "AliasAssignment" WHERE "AliasAssignment"."aliasId" = "Alias"."id"
    )
  `;

  revalidatePath("/dashboard/admin");
  return { reshuffled };
}

// ─── Usage & health ──────────────────────────────────────────────────────────

export async function getAliasUsage(): Promise<AliasUsageDTO[]> {
  await requireAliasAdmin();
  const [rows, revealed] = await Promise.all([
    prisma.aliasAssignment.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        alias: { select: { name: true, imageUrl: true, gender: true } },
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.projectMember.findMany({
      where: { showRealName: true },
      select: { userId: true, projectId: true },
    }),
  ]);
  const shownByName = new Set(revealed.map((m) => `${m.userId}:${m.projectId}`));

  return rows.map((r) => ({
    id: r.id,
    aliasName: r.alias.name,
    aliasImageUrl: r.alias.imageUrl,
    gender: r.alias.gender,
    userId: r.user.id,
    userName: r.user.name ?? r.user.email,
    userImageUrl: r.user.imageUrl,
    projectId: r.project.id,
    projectName: r.project.name,
    showRealName: shownByName.has(`${r.user.id}:${r.project.id}`),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getAliasStats(): Promise<AliasStatsDTO> {
  await requireAliasAdmin();

  const [availableMale, availableFemale, assignedCount, members] = await Promise.all([
    prisma.alias.count({
      where: { gender: "MALE", active: true, assignment: { is: null } },
    }),
    prisma.alias.count({
      where: { gender: "FEMALE", active: true, assignment: { is: null } },
    }),
    prisma.aliasAssignment.count(),
    prisma.projectMember.findMany({
      // Members this project shows by name are not gaps in the pool, so they are
      // kept out of the stats and the backfill list entirely.
      where: { role: { not: "CLIENT" }, showRealName: false },
      select: {
        role: true,
        projectId: true,
        project: { select: { name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            systemRole: true,
            excludeFromAlias: true,
            gender: true,
          },
        },
      },
    }),
  ]);

  const candidates = members.filter((m) => m.user.systemRole !== "CLIENT" && !m.user.excludeFromAlias);

  // Grouped per person: the same someone missing a gender usually sits on
  // several projects, and naming each project makes the leak concrete.
  const missingGenderMap = new Map<
    string,
    { userName: string; projectNames: string[] }
  >();
  for (const m of candidates) {
    if (m.user.gender !== null) continue;
    const entry = missingGenderMap.get(m.user.id) ?? {
      userName: m.user.name ?? m.user.email,
      projectNames: [],
    };
    entry.projectNames.push(m.project.name);
    missingGenderMap.set(m.user.id, entry);
  }

  const claimable = candidates.filter((m) => needsAlias(m.user, { memberRole: m.role }));
  const existing = claimable.length
    ? await prisma.aliasAssignment.findMany({
        where: {
          userId: { in: [...new Set(claimable.map((m) => m.user.id))] },
          projectId: { in: [...new Set(claimable.map((m) => m.projectId))] },
        },
        select: { userId: true, projectId: true },
      })
    : [];
  const held = new Set(existing.map((a) => `${a.userId}:${a.projectId}`));

  return {
    availableMale,
    availableFemale,
    assignedCount,
    claimableCount: claimable.length,
    missingGender: [...missingGenderMap].map(([userId, entry]) => ({
      userId,
      userName: entry.userName,
      projectNames: entry.projectNames,
    })),
    unaliased: claimable
      .filter((m) => !held.has(`${m.user.id}:${m.projectId}`))
      .map((m) => ({
        userId: m.user.id,
        userName: m.user.name ?? m.user.email,
        projectId: m.projectId,
        projectName: m.project.name,
      })),
  };
}

/**
 * Assign aliases to project members who predate this feature (or whose claim
 * was skipped because the pool was empty at the time). Reports failures instead
 * of throwing so one exhausted gender doesn't abort the rest.
 */
export async function backfillAliasAssignments(): Promise<{
  assigned: number;
  failed: { userName: string; projectName: string; reason: string }[];
}> {
  await requireAliasAdmin();

  // Say so rather than reporting nought assigned: with the mechanism off every
  // claim below is a no-op, which reads like a broken button.
  if (!(await aliasesEnabled(prisma))) {
    throw new Error("Aliases are switched off. Turn them on before assigning any.");
  }

  const members = await prisma.projectMember.findMany({
    where: { role: { not: "CLIENT" }, showRealName: false },
    select: {
      role: true,
      projectId: true,
      project: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          systemRole: true,
          excludeFromAlias: true,
          gender: true,
        },
      },
    },
  });

  const alreadyHeld = new Set(
    (
      await prisma.aliasAssignment.findMany({ select: { userId: true, projectId: true } })
    ).map((a) => `${a.userId}:${a.projectId}`),
  );

  let assigned = 0;
  const failed: { userName: string; projectName: string; reason: string }[] = [];

  for (const m of members) {
    if (alreadyHeld.has(`${m.user.id}:${m.projectId}`)) continue;
    // Report a missing gender rather than skipping silently: it is the one
    // reason a member stays unaliased that an admin has to go and fix.
    if (
      m.user.gender === null &&
      m.user.systemRole !== "CLIENT" &&
      m.role !== "CLIENT" &&
      !m.user.excludeFromAlias
    ) {
      failed.push({
        userName: m.user.name ?? m.user.email,
        projectName: m.project.name,
        reason: "No gender recorded — set it on the Members tab",
      });
      continue;
    }
    if (!needsAlias(m.user, { memberRole: m.role })) continue;
    try {
      const result = await claimAliasForMember(prisma, {
        userId: m.user.id,
        projectId: m.projectId,
        memberRole: m.role,
      });
      if (result) assigned += 1;
    } catch (err) {
      failed.push({
        userName: m.user.name ?? m.user.email,
        projectName: m.project.name,
        reason: isAliasPoolExhausted(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error",
      });
    }
  }

  revalidatePath("/dashboard/admin");
  return { assigned, failed };
}
