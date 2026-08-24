"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, acceptPendingInvitations } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { cache } from "react";
import type { SystemRole, TeamRole } from "@/generated/prisma/client";

async function requireAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Unauthorized");
  return user;
}

// ─── Team CRUD ───────────────────────────────────────────────

export async function getTeams() {
  await requireUser();
  return prisma.team.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { projects: true, members: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, imageUrl: true, systemRole: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function ensureDefaultTeams() {
  await requireAdmin();
  const defaults = await prisma.team.findMany({ where: { isDefault: true } });
  const hasNizek = defaults.some((t) => t.name === "Nizek");
  const hasClients = defaults.some((t) => t.name === "Clients");

  if (!hasNizek) {
    await prisma.team.create({ data: { name: "Nizek", isDefault: true } });
  }
  if (!hasClients) {
    await prisma.team.create({ data: { name: "Clients", isDefault: true } });
  }

  if (!hasNizek || !hasClients) {
    await syncDefaultTeamMembers();
  }
}

async function syncDefaultTeamMembers() {
  const [nizek, clients] = await Promise.all([
    prisma.team.findFirst({ where: { name: "Nizek", isDefault: true } }),
    prisma.team.findFirst({ where: { name: "Clients", isDefault: true } }),
  ]);

  if (nizek) {
    const internalUsers = await prisma.user.findMany({
      where: { systemRole: { not: "CLIENT" }, blocked: false },
      select: { id: true },
    });
    if (internalUsers.length > 0) {
      await prisma.teamMember.createMany({
        data: internalUsers.map((u) => ({ userId: u.id, teamId: nizek.id })),
        skipDuplicates: true,
      });
    }
  }

  if (clients) {
    const clientUsers = await prisma.user.findMany({
      where: { systemRole: "CLIENT", blocked: false },
      select: { id: true },
    });
    if (clientUsers.length > 0) {
      await prisma.teamMember.createMany({
        data: clientUsers.map((u) => ({ userId: u.id, teamId: clients.id })),
        skipDuplicates: true,
      });
    }
  }
}

export async function createTeam(data: { name: string }) {
  await requireAdmin();
  const name = data.name.trim();
  if (!name) throw new Error("Team name is required");

  const existing = await prisma.team.findUnique({ where: { name } });
  if (existing) return { error: "A team with this name already exists" };

  await prisma.team.create({ data: { name } });
  revalidatePath("/dashboard/settings");
  return {};
}

export async function updateTeam(data: { teamId: string; name: string }) {
  await requireAdmin();

  const team = await prisma.team.findUnique({ where: { id: data.teamId } });
  if (team?.isDefault) return { error: "Cannot rename a default team" };

  const name = data.name.trim();
  if (!name) throw new Error("Team name is required");

  const existing = await prisma.team.findFirst({
    where: { name, NOT: { id: data.teamId } },
  });
  if (existing) return { error: "A team with this name already exists" };

  await prisma.team.update({
    where: { id: data.teamId },
    data: { name },
  });
  revalidatePath("/dashboard/settings");
  return {};
}

export async function deleteTeam(teamId: string) {
  await requireAdmin();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { projects: true } } },
  });
  if (!team) throw new Error("Team not found");
  if (team.isDefault) return { error: "Cannot delete the default team." };
  if (team._count.projects > 0) {
    return { error: "Cannot delete a team that has projects. Reassign them first." };
  }

  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/dashboard/settings");
  return {};
}

// ─── Team Members ────────────────────────────────────────────

export async function getTeamMembers() {
  await requireUser();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 1000,
    include: {
      projects: {
        include: {
          project: { select: { id: true, name: true } },
          projectRole: { select: { id: true, name: true } },
        },
      },
      teams: {
        select: { team: { select: { id: true, name: true } } },
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    imageUrl: u.imageUrl,
    systemRole: u.systemRole,
    blocked: u.blocked,
    createdAt: u.createdAt,
    projects: u.projects.map((p) => ({
      id: p.project.id,
      name: p.project.name,
      role: p.role,
      roleName: p.projectRole?.name ?? p.role,
      memberId: p.id,
      roleId: p.roleId,
    })),
    teams: u.teams.map((t) => ({ id: t.team.id, name: t.team.name })),
  }));
}

export async function updateUserRole(userId: string, systemRole: SystemRole) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can change user roles");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { systemRole },
  });

  revalidatePath("/dashboard/team");
}

export async function updateUserAdmin(userId: string, isAdmin: boolean) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can change user roles");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { systemRole: isAdmin ? "ADMIN" : "DEVELOPER" },
  });

  revalidatePath("/dashboard/team");
}

export async function updateUserEmail(userId: string, email: string) {
  await requireAdmin();

  const next = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    return { error: "Enter a valid email address" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found" };
  if (target.email.toLowerCase() === next) return {};

  const taken = await prisma.user.findFirst({
    where: { email: { equals: next, mode: "insensitive" }, NOT: { id: userId } },
    select: { id: true },
  });
  if (taken) return { error: "Another member already uses this email" };

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { email: next } }),
    prisma.allowedEmail.upsert({
      where: { email: next },
      update: {},
      create: { email: next },
    }),
  ]);

  revalidatePath("/dashboard/team");
  return {};
}

const reconcileSignedUpInvites = cache(async () => {
  try {
    const [invitations, teamInvites] = await Promise.all([
      prisma.invitation.findMany({ where: { status: "PENDING" }, select: { email: true } }),
      prisma.pendingTeamInvite.findMany({ select: { email: true } }),
    ]);
    const invitedEmails = [...new Set(
      [...invitations, ...teamInvites].map((i) => i.email.toLowerCase()),
    )];
    if (invitedEmails.length === 0) return;

    const localUsers = await prisma.user.findMany({
      where: {
        OR: invitedEmails.map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      },
      select: { id: true, email: true },
    });
    if (localUsers.length === 0) return;

    for (const u of localUsers) {
      await acceptPendingInvitations(u.id, u.email).catch(() => {});
    }

    const existingEmails = localUsers.map((u) => u.email.toLowerCase());
    await prisma.pendingTeamInvite
      .deleteMany({ where: { email: { in: existingEmails } } })
      .catch(() => {});
  } catch {
    // Reconciliation is best-effort
  }
});

export async function getPendingInvitations() {
  await requireUser();
  await reconcileSignedUpInvites();

  const invitations = await prisma.invitation.findMany({
    where: { status: "PENDING" },
    include: {
      project: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, imageUrl: true } },
      projectRole: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (invitations.length === 0) return [];

  const emails = [...new Set(invitations.map((i) => i.email.toLowerCase()))];
  const users = await prisma.user.findMany({
    where: {
      OR: emails.map((email) => ({
        email: { equals: email, mode: "insensitive" as const },
      })),
    },
    select: { id: true, email: true },
  });

  if (users.length > 0) {
    await Promise.all(
      users.map((u) => acceptPendingInvitations(u.id, u.email).catch(() => {})),
    );
    const existingEmails = new Set(users.map((u) => u.email.toLowerCase()));
    return invitations.filter((i) => !existingEmails.has(i.email.toLowerCase()));
  }

  return invitations;
}

export async function inviteToTeam(data: {
  email: string;
  systemRole: SystemRole;
  firstName: string;
  lastName: string;
  teamId?: string;
  projects?: { projectId: string; roleId: string }[];
}) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can invite team members");
  }

  const email = data.email.toLowerCase().trim();
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  if (!firstName || !lastName) {
    throw new Error("First name and last name are required");
  }

  const teamId = data.teamId || null;
  await prisma.pendingTeamInvite.upsert({
    where: { email },
    update: { systemRole: data.systemRole, firstName, lastName, teamId },
    create: { email, systemRole: data.systemRole, firstName, lastName, teamId },
  });

  const assignments = (data.projects ?? []).filter((p) => p.projectId && p.roleId);

  if (data.systemRole === "CLIENT" && assignments.length > 0) {
    const { inviteMember } = await import("@/actions/project");
    for (const a of assignments) {
      await inviteMember({ projectId: a.projectId, email, roleId: a.roleId });
    }
  } else {
    for (const a of assignments) {
      const pRole = await prisma.projectRole.findUnique({ where: { id: a.roleId } });
      if (!pRole) throw new Error("Invalid project role");
      await prisma.invitation.upsert({
        where: { email_projectId: { email, projectId: a.projectId } },
        update: {
          role: pRole.isAdmin ? "ADMIN" : "MEMBER",
          roleId: a.roleId,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        create: {
          email,
          role: pRole.isAdmin ? "ADMIN" : "MEMBER",
          roleId: a.roleId,
          projectId: a.projectId,
          invitedById: currentUser.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    await prisma.allowedEmail.upsert({
      where: { email },
      update: {},
      create: { email },
    });
  }

  revalidatePath("/dashboard/team");
}

export async function getPendingTeamInvites() {
  await requireUser();
  await reconcileSignedUpInvites();
  const invites = await prisma.pendingTeamInvite.findMany({
    include: { team: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (invites.length === 0) return [];

  const existingUsers = await prisma.user.findMany({
    where: {
      OR: invites.map((i) => ({
        email: { equals: i.email, mode: "insensitive" as const },
      })),
    },
    select: { email: true },
  });
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  const staleIds = invites.filter((i) => existingEmails.has(i.email.toLowerCase())).map((i) => i.id);
  if (staleIds.length > 0) {
    prisma.pendingTeamInvite.deleteMany({ where: { id: { in: staleIds } } }).catch(() => {});
  }

  return invites.filter((i) => !existingEmails.has(i.email.toLowerCase()));
}

export async function getProjectsWithRoles() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") return [];

  const [projects, roles] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.projectRole.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, isAdmin: true } }),
  ]);

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    roles,
  }));
}

export async function cancelTeamInvite(inviteId: string) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can cancel invitations");
  }

  const invite = await prisma.pendingTeamInvite.findUnique({
    where: { id: inviteId },
  });
  if (!invite) throw new Error("Invite not found");

  await prisma.$transaction([
    prisma.pendingTeamInvite.delete({ where: { id: inviteId } }),
    prisma.allowedEmail.deleteMany({ where: { email: invite.email } }),
  ]);

  revalidatePath("/dashboard/team");
}

export async function resendTeamInvite(inviteId: string) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can resend invitations");
  }

  const invite = await prisma.pendingTeamInvite.findUnique({
    where: { id: inviteId },
  });
  if (!invite) throw new Error("Invite not found");

  const { Resend } = await import("resend");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://amused-wonder-production-c7e9.up.railway.app";
  const inviterName = currentUser.name || currentUser.email;
  const roleLabel = invite.systemRole.replace("_", " ");

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "Nizek Project <onboarding@resend.dev>",
    to: invite.email,
    subject: "Reminder: You've been invited to Nizek Project",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
          <h2 style="margin: 0 0 8px; color: #ffffff; font-size: 20px;">Reminder: You're invited!</h2>
          <p style="margin: 0 0 24px; color: #a0a0b0; font-size: 14px; line-height: 1.5;">
            <strong style="color: #ffffff;">${inviterName}</strong> invited you to join
            <strong style="color: #4ade80;">Nizek Project</strong> as
            <strong style="color: #c084fc;">${roleLabel}</strong>.
          </p>
          <a href="${appUrl}/sign-in"
             style="display: inline-block; background: #4ade80; color: #0a0a0a; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Get Started
          </a>
        </div>
      </div>
    `,
  });

  revalidatePath("/dashboard/team");
}

export async function getUserTaskSummary(userId: string) {
  await requireAdmin();

  const projects = await prisma.project.findMany({
    where: {
      tasks: {
        some: {
          archivedAt: null,
          OR: [
            { assigneeId: userId },
            { createdById: userId },
            { developerId: userId },
            { clientReviewerId: userId },
          ],
        },
      },
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          tasks: {
            where: {
              archivedAt: null,
              OR: [
                { assigneeId: userId },
                { createdById: userId },
                { developerId: userId },
                { clientReviewerId: userId },
              ],
            },
          },
        },
      },
      members: {
        where: { userId: { not: userId } },
        select: { user: { select: { id: true, name: true, imageUrl: true, systemRole: true } } },
        take: 50,
      },
    },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    taskCount: p._count.tasks,
    eligibleTransferTargets: p.members.map((m) => m.user),
  }));
}

export async function toggleBlockUser(
  userId: string,
  transfers?: { projectId: string; transferToUserId: string }[],
) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can block/unblock users");
  }
  if (currentUser.id === userId) {
    throw new Error("You cannot block yourself");
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("User not found");

  const newBlocked = !target.blocked;

  if (newBlocked) {
    const taskCount = await prisma.task.count({
      where: {
        archivedAt: null,
        OR: [
          { assigneeId: userId },
          { createdById: userId },
          { developerId: userId },
          { clientReviewerId: userId },
        ],
      },
    });

    if (taskCount > 0 && (!transfers || transfers.length === 0)) {
      throw new Error("TRANSFER_REQUIRED");
    }

    if (transfers && transfers.length > 0) {
      const ops = transfers.flatMap((t) => [
        prisma.task.updateMany({
          where: { projectId: t.projectId, assigneeId: userId, archivedAt: null },
          data: { assigneeId: t.transferToUserId },
        }),
        prisma.task.updateMany({
          where: { projectId: t.projectId, createdById: userId },
          data: { createdById: t.transferToUserId },
        }),
        prisma.task.updateMany({
          where: { projectId: t.projectId, developerId: userId, archivedAt: null },
          data: { developerId: t.transferToUserId },
        }),
        prisma.task.updateMany({
          where: { projectId: t.projectId, clientReviewerId: userId, archivedAt: null },
          data: { clientReviewerId: t.transferToUserId },
        }),
        prisma.project.updateMany({
          where: { id: t.projectId, defaultClientReviewerId: userId },
          data: { defaultClientReviewerId: t.transferToUserId },
        }),
      ]);
      await prisma.$transaction(ops);
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { blocked: newBlocked },
  });

  if (newBlocked) {
    await prisma.authSession.deleteMany({ where: { userId } });
  }

  revalidatePath("/dashboard/team");
  return newBlocked;
}

// ─── Team Member Management ───────────────────────────────────

export async function addTeamMember(data: { teamId: string; userId: string; role?: TeamRole }) {
  await requireAdmin();

  const team = await prisma.team.findUnique({ where: { id: data.teamId } });
  if (team?.isDefault) return { error: "Cannot manually add members to a default team" };

  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: data.userId, teamId: data.teamId } },
  });
  if (existing) return { error: "User is already a member of this team" };

  await prisma.teamMember.create({
    data: { userId: data.userId, teamId: data.teamId, role: data.role ?? "MEMBER" },
  });
  revalidatePath("/dashboard/settings");
  return {};
}

export async function removeTeamMember(data: { teamId: string; userId: string }) {
  await requireAdmin();

  const team = await prisma.team.findUnique({ where: { id: data.teamId } });
  if (team?.isDefault) throw new Error("Cannot remove members from a default team");

  await prisma.teamMember.delete({
    where: { userId_teamId: { userId: data.userId, teamId: data.teamId } },
  });
  revalidatePath("/dashboard/settings");
}

export async function updateTeamMemberRole(data: { teamId: string; userId: string; role: TeamRole }) {
  await requireAdmin();
  await prisma.teamMember.update({
    where: { userId_teamId: { userId: data.userId, teamId: data.teamId } },
    data: { role: data.role },
  });
  revalidatePath("/dashboard/settings");
}

export async function getAvailableUsersForTeam(teamId: string) {
  await requireAdmin();
  const existingMembers = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  const memberIds = new Set(existingMembers.map((m) => m.userId));

  const users = await prisma.user.findMany({
    where: { blocked: false, systemRole: { not: "CLIENT" } },
    select: { id: true, name: true, email: true, imageUrl: true, systemRole: true },
    orderBy: { name: "asc" },
  });

  return users.filter((u) => !memberIds.has(u.id));
}

export { getPendingTeamInvites as getPendingInvitesForTeam };

export async function assignUserToInvitedTeam(userId: string, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return;
  await prisma.teamMember.upsert({
    where: { userId_teamId: { userId, teamId } },
    update: {},
    create: { userId, teamId, role: "MEMBER" },
  });
}

export async function assignUserToDefaultTeam(userId: string, isClient: boolean = false) {
  const teamName = isClient ? "Clients" : "Nizek";
  const defaultTeam = await prisma.team.findFirst({ where: { name: teamName, isDefault: true } });
  if (!defaultTeam) return;

  await prisma.teamMember.upsert({
    where: { userId_teamId: { userId, teamId: defaultTeam.id } },
    update: {},
    create: { userId, teamId: defaultTeam.id, role: "MEMBER" },
  });
}

export async function removeFromAllowlist(email: string) {
  await requireUser();
  await prisma.allowedEmail.deleteMany({ where: { email: email.toLowerCase() } });
}
