import { prisma } from "@/lib/prisma";
import { joinDisplayName, splitDisplayName } from "@/lib/display-name";
import { claimAliasForMember, isAliasBlocked } from "@/lib/alias";

export function logPendingInviteError(
  context: string,
  details: { userId?: string; email?: string; error: unknown },
) {
  const err = details.error;
  console.error(`[pending-invite] ${context}`, {
    userId: details.userId,
    email: details.email,
    error: err instanceof Error ? err.stack ?? err.message : err,
  });
}

export async function acceptPendingInvitations(userId: string, email: string) {
  const pending = await prisma.invitation.findMany({
    where: { email: { equals: email, mode: "insensitive" }, status: "PENDING" },
  });
  if (pending.length === 0) return;

  const existingMembers = await prisma.projectMember.findMany({
    where: {
      userId,
      projectId: { in: pending.map((inv) => inv.projectId) },
    },
    select: { projectId: true },
  });
  const memberSet = new Set(existingMembers.map((m) => m.projectId));

  const newMembers = pending.filter((inv) => !memberSet.has(inv.projectId));

  // Each membership is created together with its alias. When none can be drawn
  // we skip that project and leave the invitation PENDING so the next sign-in
  // retries — joining without an alias would expose a real name to the client.
  const blockedInviteIds = new Set<string>();
  const createdMembers: typeof newMembers = [];

  for (const inv of newMembers) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.projectMember.upsert({
          where: { userId_projectId: { userId, projectId: inv.projectId } },
          update: {},
          create: {
            userId,
            projectId: inv.projectId,
            role: inv.role,
            roleId: inv.roleId,
          },
        });
        await claimAliasForMember(tx, {
          userId,
          projectId: inv.projectId,
          memberRole: inv.role,
        });
      });
      createdMembers.push(inv);
    } catch (error) {
      // Sign-in runs through here, so a blocked alias must never surface as a
      // failed login — the invitation simply waits.
      if (!isAliasBlocked(error)) throw error;
      blockedInviteIds.add(inv.id);
      logPendingInviteError("No alias available — project assignment deferred", {
        userId,
        email,
        error,
      });
    }
  }

  // A membership that predates the alias pool, or that some earlier path seated
  // without one, is only discoverable at moments like this. The claim is
  // idempotent, so re-checking costs one query and repairs the gap.
  for (const inv of pending.filter((i) => memberSet.has(i.projectId))) {
    try {
      await claimAliasForMember(prisma, {
        userId,
        projectId: inv.projectId,
        memberRole: inv.role,
      });
    } catch (error) {
      if (!isAliasBlocked(error)) throw error;
      blockedInviteIds.add(inv.id);
      logPendingInviteError("No alias available — existing membership unaliased", {
        userId,
        email,
        error,
      });
    }
  }

  const acceptedIds = pending
    .filter((inv) => !blockedInviteIds.has(inv.id))
    .map((inv) => inv.id);
  if (acceptedIds.length > 0) {
    await prisma.invitation.updateMany({
      where: { id: { in: acceptedIds } },
      data: { status: "ACCEPTED" },
    });
  }

  if (createdMembers.length > 0) {
    const { syncClientConversationParticipants } = await import("@/lib/client-chat");
    const { promoteUserToClient, ensureClientChatForProject } = await import("@/lib/client-role");
    const projectIds = [...new Set(createdMembers.map((m) => m.projectId))];
    if (createdMembers.some((m) => m.role === "CLIENT")) {
      await promoteUserToClient(userId);
    }
    const enabled = await prisma.project.findMany({
      where: { id: { in: projectIds }, clientChatEnabled: true },
      select: { id: true },
    });
    const clientProjects = createdMembers.filter((m) => m.role === "CLIENT").map((m) => m.projectId);
    const results = await Promise.allSettled([
      ...enabled.map((p) => syncClientConversationParticipants(p.id)),
      ...clientProjects.map((id) => ensureClientChatForProject(id)),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        logPendingInviteError("Client chat sync failed after project assignment", {
          userId,
          email,
          error: result.reason,
        });
      }
    }
  }
}

/**
 * Idempotent. Applies PendingTeamInvite + project invitations for a signed-in
 * user. Throws on assignment failure so callers can log and retry; pending
 * rows are only removed after team/role application succeeds, so a later
 * session can finish the job.
 */
export async function applyPendingInvite(
  userId: string,
  email: string,
): Promise<{ userMutated: boolean }> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return { userMutated: false };

  const [pending, pendingProjectCount] = await Promise.all([
    prisma.pendingTeamInvite.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
    }),
    prisma.invitation.count({
      where: { email: { equals: normalized, mode: "insensitive" }, status: "PENDING" },
    }),
  ]);

  if (!pending && pendingProjectCount === 0) return { userMutated: false };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true, name: true, gender: true, excludeFromAlias: true },
  });
  if (!user) {
    throw new Error(`User ${userId} not found while applying pending invite`);
  }

  let userMutated = false;

  const inviteName =
    joinDisplayName(pending?.firstName, pending?.lastName) ||
    (
      await prisma.invitation.findFirst({
        where: {
          email: { equals: normalized, mode: "insensitive" },
          status: "PENDING",
          name: { not: null },
        },
        select: { name: true },
        orderBy: { createdAt: "desc" },
      })
    )?.name?.trim() ||
    "";
  const nameChanged = Boolean(inviteName) && inviteName !== user.name;

  if (pending) {
    const roleChanged = pending.systemRole !== user.systemRole;
    const genderChanged = Boolean(pending.gender) && pending.gender !== user.gender;
    const aliasChanged = pending.excludeFromAlias !== user.excludeFromAlias;

    if (roleChanged || nameChanged || genderChanged || aliasChanged) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(roleChanged ? { systemRole: pending.systemRole } : {}),
          ...(nameChanged ? { name: inviteName } : {}),
          ...(genderChanged ? { gender: pending.gender } : {}),
          excludeFromAlias: pending.excludeFromAlias,
        },
      });
      userMutated = true;
    }

    if (pending.teamId) {
      await prisma.teamMember.upsert({
        where: { userId_teamId: { userId, teamId: pending.teamId } },
        update: {},
        create: { userId, teamId: pending.teamId, role: "MEMBER" },
      });
    }
  } else if (nameChanged) {
    await prisma.user.update({
      where: { id: userId },
      data: { name: inviteName },
    });
    userMutated = true;
  }

  const isClient = (pending?.systemRole ?? user.systemRole) === "CLIENT";
  const defaultTeam = await prisma.team.findFirst({
    where: { name: isClient ? "Clients" : "Nizek", isDefault: true },
  });
  if (defaultTeam) {
    await prisma.teamMember.upsert({
      where: { userId_teamId: { userId, teamId: defaultTeam.id } },
      update: {},
      create: { userId, teamId: defaultTeam.id, role: "MEMBER" },
    });
  }

  if (pending) {
    await prisma.pendingTeamInvite.delete({ where: { id: pending.id } });
  }

  await acceptPendingInvitations(userId, normalized);

  return { userMutated };
}

/**
 * Create a real User from a pending invite so an admin can view-as them
 * before they sign in with Google. Later Google sign-in links to this row
 * (email is unique + verified).
 */
export async function provisionUserFromPendingInvite(
  email: string,
): Promise<{ userId: string } | { error: string }> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return { error: "Invalid email" };

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    await applyPendingInvite(existing.id, normalized);
    return { userId: existing.id };
  }

  const [teamInvite, projectInvite] = await Promise.all([
    prisma.pendingTeamInvite.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
    }),
    prisma.invitation.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" }, status: "PENDING" },
      select: { id: true, name: true },
    }),
  ]);

  if (!teamInvite && !projectInvite) {
    return { error: "No pending invite for this email" };
  }

  const inviteName =
    joinDisplayName(teamInvite?.firstName, teamInvite?.lastName) ||
    projectInvite?.name?.trim() ||
    "";

  const user = await prisma.user.create({
    data: {
      email: normalized,
      emailVerified: true,
      name: inviteName || normalized.split("@")[0] || null,
      systemRole: teamInvite?.systemRole ?? "DEVELOPER",
    },
    select: { id: true },
  });

  await prisma.allowedEmail.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized },
  });

  await applyPendingInvite(user.id, normalized);
  return { userId: user.id };
}

/** Keep pending invites and an existing user in sync when a display name is edited. */
export async function syncInviteDisplayName(email: string, name: string) {
  const normalized = email.toLowerCase().trim();
  const trimmed = name.trim();
  if (!normalized || !trimmed) return;

  const { firstName, lastName } = splitDisplayName(trimmed);

  await prisma.invitation.updateMany({
    where: { email: { equals: normalized, mode: "insensitive" }, status: "PENDING" },
    data: { name: trimmed },
  });

  const pending = await prisma.pendingTeamInvite.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (pending) {
    await prisma.pendingTeamInvite.update({
      where: { id: pending.id },
      data: { firstName, lastName },
    });
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name: trimmed },
    });
  }
}

/**
 * Drop AllowedEmail only when this address has no remaining reason to sign in:
 * another pending team add, another pending project add, or an existing user.
 * Call after deleting a PendingTeamInvite or Invitation.
 */
export async function removeFromAllowlistIfUnused(email: string) {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return;

  const [teamInvite, projectInvite, user] = await Promise.all([
    prisma.pendingTeamInvite.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { id: true },
    }),
    prisma.invitation.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" }, status: "PENDING" },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);

  if (teamInvite || projectInvite || user) return;

  await prisma.allowedEmail.deleteMany({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });
}
