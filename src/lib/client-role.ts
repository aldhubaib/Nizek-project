import "server-only";
import { prisma } from "@/lib/prisma";
import { enableClientChat } from "@/lib/client-chat";
import { splitDisplayName } from "@/lib/display-name";
import type { Role } from "@/generated/prisma/client";

const CLIENT_TEAM_NAME = "Clients";

export function membershipRoleFromProjectRole(pRole: {
  isAdmin: boolean;
  isClient: boolean;
}): Role {
  if (pRole.isAdmin) return "ADMIN";
  if (pRole.isClient) return "CLIENT";
  return "MEMBER";
}

export function clientRoleWriteData(isClient: boolean) {
  if (!isClient) return { isClient: false };
  return {
    isClient: true,
    isAdmin: false,
    canCreateTask: false,
    canModifyTask: false,
    canMoveTask: false,
    canDeleteTask: false,
    canDeclineTask: false,
    isTeamLead: false,
    canCreateSprintPlanning: false,
    canStartSprint: false,
    canEndSprint: false,
    canDeleteSprint: false,
    allowedTransitions: null as string | null,
  };
}

export async function hasClientProjectMembership(userId: string): Promise<boolean> {
  const row = await prisma.projectMember.findFirst({
    where: {
      userId,
      OR: [{ role: "CLIENT" }, { projectRole: { isClient: true } }],
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function isClientAccount(userId: string): Promise<boolean> {
  if (await hasClientProjectMembership(userId)) return true;
  const onClientsTeam = await prisma.teamMember.findFirst({
    where: {
      userId,
      team: { name: CLIENT_TEAM_NAME, isDefault: true },
    },
    select: { id: true },
  });
  return Boolean(onClientsTeam);
}

/**
 * Which of these users read the given project as a client, and so must be sent
 * aliases rather than real names.
 *
 * The stored `systemRole` is not the test on its own. `withEffectiveClientRole`
 * below promotes anyone holding a client seat to CLIENT for the request, so a
 * user whose stored role had drifted would be masked on screen and unmasked in
 * whatever a background job sends them. Admins are excluded here for the same
 * reason that promotion skips them: they are staff and see the real names.
 *
 * Answers for a batch in two queries — fan-out paths call this per publish.
 */
export async function clientViewerIds(
  userIds: string[],
  projectId: string,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const [byRole, bySeat] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, systemRole: "CLIENT" },
      select: { id: true },
    }),
    prisma.projectMember.findMany({
      where: {
        projectId,
        userId: { in: userIds },
        user: { systemRole: { not: "ADMIN" } },
        OR: [{ role: "CLIENT" }, { projectRole: { isClient: true } }],
      },
      select: { userId: true },
    }),
  ]);

  return new Set([...byRole.map((u) => u.id), ...bySeat.map((m) => m.userId)]);
}

/**
 * Clients are chat-only. If their system role drifted but they still sit on a
 * client project seat, treat them as CLIENT so view-as matches a real login.
 */
export async function withEffectiveClientRole<T extends { id: string; systemRole: string }>(
  user: T,
): Promise<T> {
  if (user.systemRole === "CLIENT" || user.systemRole === "ADMIN") return user;
  if (await isClientAccount(user.id)) {
    return { ...user, systemRole: "CLIENT" };
  }
  return user;
}

export async function promoteUserToClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  });
  if (!user || user.systemRole === "ADMIN") return;

  if (user.systemRole !== "CLIENT") {
    await prisma.user.update({
      where: { id: userId },
      data: { systemRole: "CLIENT" },
    });
  }

  const clientsTeam = await prisma.team.findFirst({
    where: { name: CLIENT_TEAM_NAME, isDefault: true },
    select: { id: true },
  });
  if (clientsTeam) {
    await prisma.teamMember.upsert({
      where: { userId_teamId: { userId, teamId: clientsTeam.id } },
      update: {},
      create: { userId, teamId: clientsTeam.id, role: "MEMBER" },
    });
  }
}

export async function demoteClientIfUnneeded(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  });
  if (!user || user.systemRole !== "CLIENT") return;

  const stillClient = await prisma.projectMember.findFirst({
    where: {
      userId,
      OR: [{ role: "CLIENT" }, { projectRole: { isClient: true } }],
    },
    select: { id: true },
  });
  if (stillClient) return;

  await prisma.user.update({
    where: { id: userId },
    data: { systemRole: "DEVELOPER" },
  });
}

export async function ensureClientChatForProject(projectId: string, staffUserId?: string) {
  await enableClientChat(projectId, staffUserId);
}

export async function rememberClientSignup(
  email: string,
  name?: string,
  profile?: { gender?: "MALE" | "FEMALE" | null; excludeFromAlias?: boolean },
) {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return;

  const clientsTeam = await prisma.team.findFirst({
    where: { name: CLIENT_TEAM_NAME, isDefault: true },
    select: { id: true },
  });

  const trimmedName = name?.trim();
  const parts = trimmedName ? splitDisplayName(trimmedName) : null;

  await prisma.pendingTeamInvite.upsert({
    where: { email: normalized },
    update: {
      systemRole: "CLIENT",
      teamId: clientsTeam?.id ?? undefined,
      ...(parts ? { firstName: parts.firstName, lastName: parts.lastName } : {}),
      ...(profile?.gender ? { gender: profile.gender } : {}),
      ...(profile?.excludeFromAlias != null ? { excludeFromAlias: profile.excludeFromAlias } : {}),
    },
    create: {
      email: normalized,
      systemRole: "CLIENT",
      teamId: clientsTeam?.id ?? null,
      ...(parts ? { firstName: parts.firstName, lastName: parts.lastName } : {}),
      ...(profile?.gender ? { gender: profile.gender } : {}),
      excludeFromAlias: profile?.excludeFromAlias ?? true,
    },
  });
}

/** Drop the chat-only signup row if this email has no other pending project invites. */
export async function forgetClientSignupIfUnused(email: string) {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return;

  const remaining = await prisma.invitation.count({
    where: { email: { equals: normalized, mode: "insensitive" }, status: "PENDING" },
  });
  if (remaining > 0) return;

  await prisma.pendingTeamInvite.deleteMany({
    where: {
      email: { equals: normalized, mode: "insensitive" },
      systemRole: "CLIENT",
    },
  });
}
