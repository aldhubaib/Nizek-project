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

/**
 * userId → alias identity for one project. Empty map means nothing to mask.
 *
 * A member whose membership says showRealName is left out, which is the whole
 * mechanism behind that switch: masking is driven by what is in this map, so
 * omitting someone shows the client their real name on this project while their
 * aliases on other projects are untouched. The assignment row stays where it is,
 * so the same alias comes back if the switch is turned off again.
 */
export async function getAliasMap(
  projectId: string | null | undefined,
): Promise<Map<string, AliasIdentity>> {
  if (!projectId) return new Map();
  const rows = await prisma.aliasAssignment.findMany({
    where: {
      projectId,
      user: { projects: { none: { projectId, showRealName: true } } },
    },
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

  // The exceptions are read separately and matched per pair, not filtered in the
  // query: with several projects in play, a relation filter would drop someone
  // shown by name on one project from every other project's map as well.
  const [rows, revealed] = await Promise.all([
    prisma.aliasAssignment.findMany({
      where: { projectId: { in: ids } },
      select: ASSIGNMENT_SELECT,
    }),
    prisma.projectMember.findMany({
      where: { projectId: { in: ids }, showRealName: true },
      select: { userId: true, projectId: true },
    }),
  ]);
  const shownByName = new Set(revealed.map((m) => `${m.userId}:${m.projectId}`));

  const byProject = new Map<string, Map<string, AliasIdentity>>();
  for (const row of rows) {
    if (shownByName.has(`${row.userId}:${row.projectId}`)) continue;
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
    where: {
      userId,
      // Only this person's membership matters here, so the project side of the
      // pair is already pinned by the row itself.
      project: { members: { none: { userId, showRealName: true } } },
    },
    select: ASSIGNMENT_SELECT,
  });
  return new Map(rows.map((r) => [r.projectId, toIdentity(r)]));
}
