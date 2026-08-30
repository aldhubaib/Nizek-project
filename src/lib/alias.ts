import "server-only";
import { prisma } from "@/lib/prisma";
import type { Gender } from "@/generated/prisma/client";
import type { AliasIdentity } from "@/lib/alias-mask";

/**
 * Alias lookups against the database. The masking helpers themselves live in
 * `@/lib/alias-mask` (no Prisma dependency, unit tested) and are re-exported
 * here so app code has a single import.
 */

export * from "@/lib/alias-mask";

/** How many aliases of this gender are still unclaimed. */
export async function availableAliasCount(gender: Gender): Promise<number> {
  return prisma.alias.count({
    where: { gender, active: true, assignment: { is: null } },
  });
}

const ASSIGNMENT_SELECT = {
  userId: true,
  projectId: true,
  alias: { select: { name: true, imageUrl: true } },
  user: { select: { name: true, email: true } },
} as const;

type AssignmentRow = {
  userId: string;
  projectId: string;
  alias: { name: string; imageUrl: string | null };
  user: { name: string | null; email: string };
};

function toIdentity(row: AssignmentRow): AliasIdentity {
  return {
    name: row.alias.name,
    imageUrl: row.alias.imageUrl,
    realName: row.user.name ?? row.user.email,
  };
}

/** userId → alias identity for one project. Empty map means nothing to mask. */
export async function getAliasMap(
  projectId: string | null | undefined,
): Promise<Map<string, AliasIdentity>> {
  if (!projectId) return new Map();
  const rows = await prisma.aliasAssignment.findMany({
    where: { projectId },
    select: ASSIGNMENT_SELECT,
  });
  return new Map(rows.map((r) => [r.userId, toIdentity(r)]));
}

/**
 * Mask map spanning several projects at once (the inbox lists threads from
 * many projects). When one person has aliases on multiple projects, the entry
 * is keyed by project so callers pick the right one per row.
 */
export async function getAliasMapsForProjects(
  projectIds: (string | null | undefined)[],
): Promise<Map<string, Map<string, AliasIdentity>>> {
  const ids = [...new Set(projectIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const rows = await prisma.aliasAssignment.findMany({
    where: { projectId: { in: ids } },
    select: ASSIGNMENT_SELECT,
  });

  const byProject = new Map<string, Map<string, AliasIdentity>>();
  for (const row of rows) {
    let map = byProject.get(row.projectId);
    if (!map) {
      map = new Map();
      byProject.set(row.projectId, map);
    }
    map.set(row.userId, toIdentity(row));
  }
  return byProject;
}

/**
 * Every alias a person holds, keyed by project. Used when notifying about an
 * actor whose project context varies by recipient.
 */
export async function getAliasesForUser(
  userId: string,
): Promise<Map<string, AliasIdentity>> {
  const rows = await prisma.aliasAssignment.findMany({
    where: { userId },
    select: ASSIGNMENT_SELECT,
  });
  return new Map(rows.map((r) => [r.projectId, toIdentity(r)]));
}
