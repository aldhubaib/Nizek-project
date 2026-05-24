"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireProjectMember, requireProjectRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { validateContractDates } from "@/lib/contract-rules";

async function requireMemberManagement(projectId: string) {
  const { user, member } = await requireProjectMember(projectId);
  if (user.systemRole === "ADMIN") {
    return { user, member, canInviteMembers: true, canInviteClients: true };
  }
  if (member.projectRole?.isAdmin) {
    return { user, member, canInviteMembers: true, canInviteClients: true };
  }
  const fullMember = await prisma.projectMember.findUnique({
    where: { id: member.id },
    select: { canInviteMembers: true, canInviteClients: true },
  });
  const canInviteMembers = fullMember?.canInviteMembers ?? false;
  const canInviteClients = fullMember?.canInviteClients ?? false;
  if (!canInviteMembers && !canInviteClients) {
    throw new Error("Insufficient permissions");
  }
  return { user, member, canInviteMembers, canInviteClients };
}

async function generateContractCode(prefixId: string): Promise<{ code: string; prefixId: string }> {
  const prefix = await prisma.contractPrefix.update({
    where: { id: prefixId },
    data: { nextNumber: { increment: 1 } },
  });
  const num = prefix.nextNumber - 1;
  return { code: `${prefix.prefix}-${String(num).padStart(3, "0")}`, prefixId };
}

export async function createProject(data: {
  name: string;
  description?: string;
  teamId?: string;
  contract: {
    label?: string;
    prefixId?: string;
    contractType?: "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE" | "STARTUP";
    startDate?: string;
    endDate?: string;
  };
}) {
  const user = await requireUser();

  const isStartup = data.contract.contractType === "STARTUP";
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (!isStartup) {
    if (!data.contract.startDate || !data.contract.endDate) {
      throw new Error("Start and end dates are required");
    }
    startDate = new Date(data.contract.startDate);
    endDate = new Date(data.contract.endDate);
    const dateError = validateContractDates(startDate, endDate, []);
    if (dateError) return { error: dateError } as any;
  }

  let codeData: { code?: string; prefixId?: string } = {};
  if (data.contract.prefixId) {
    codeData = await generateContractCode(data.contract.prefixId);
  }

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
      ...(data.teamId && { teamId: data.teamId }),
      contracts: {
        create: {
          label: data.contract.label,
          contractType: data.contract.contractType ?? "FULL_TEAM",
          startDate: startDate ?? null,
          endDate: endDate ?? null,
          ...(codeData.code && { code: codeData.code }),
          ...(codeData.prefixId && { prefixId: codeData.prefixId }),
        },
      },
    },
  });

  const adminRole = await prisma.projectRole.findFirst({ where: { isAdmin: true } });
  await prisma.projectMember.create({
    data: {
      userId: user.id,
      role: "ADMIN",
      projectId: project.id,
      roleId: adminRole?.id,
    },
  });

  revalidatePath("/dashboard");
  return project;
}

export async function getProjects() {
  const user = await requireUser();
  const where = user.systemRole === "ADMIN" ? {} : { members: { some: { userId: user.id } } };
  return prisma.project.findMany({
    where,
    include: {
      team: true,
      contracts: true,
      members: { include: { user: { select: { id: true, name: true, imageUrl: true, email: true } }, projectRole: true } },
      _count: { select: { tasks: true, meetingNotes: true, assets: true, members: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      contracts: { orderBy: { startDate: "desc" } },
      members: { include: { user: { select: { id: true, name: true, imageUrl: true, email: true } }, projectRole: true } },
      _count: { select: { tasks: true, meetingNotes: true, assets: true } },
    },
  });

  if (!project) throw new Error("Project not found");
  await requireProjectMember(project.id);
  return project;
}

export async function updateProject(data: {
  projectId: string;
  name?: string;
  description?: string;
  logoUrl?: string | null;
  teamId?: string;
}) {
  await requireProjectRole(data.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  const updated = await prisma.project.update({
    where: { id: data.projectId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.teamId && { teamId: data.teamId }),
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  revalidatePath("/dashboard/projects");
  return updated;
}

export async function addContract(data: {
  projectId: string;
  label?: string;
  prefixId?: string;
  contractType?: "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE" | "STARTUP";
  startDate?: string;
  endDate?: string;
}): Promise<{ error?: string }> {
  await requireProjectRole(data.projectId, ["ADMIN"]);

  const isStartup = data.contractType === "STARTUP";
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (!isStartup) {
    if (!data.startDate || !data.endDate) return { error: "Start and end dates are required" };
    startDate = new Date(data.startDate);
    endDate = new Date(data.endDate);

    const existing = await prisma.contract.findMany({
      where: { projectId: data.projectId },
      select: { id: true, label: true, startDate: true, endDate: true },
    });
    const dateError = validateContractDates(startDate, endDate, existing);
    if (dateError) return { error: dateError };
  }

  let codeData: { code?: string; prefixId?: string } = {};
  if (data.prefixId) {
    codeData = await generateContractCode(data.prefixId);
  }

  await prisma.contract.create({
    data: {
      label: data.label,
      contractType: data.contractType ?? "FULL_TEAM",
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      projectId: data.projectId,
      ...(codeData.code && { code: codeData.code }),
      ...(codeData.prefixId && { prefixId: codeData.prefixId }),
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return {};
}

export async function deleteContract(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { project: true },
  });
  if (!contract) throw new Error("Contract not found");
  await requireProjectRole(contract.projectId, ["ADMIN"]);

  await prisma.contract.delete({ where: { id: contractId } });
  revalidatePath(`/dashboard/projects/${contract.projectId}`);
}

export async function updateContract(data: {
  contractId: string;
  label?: string;
  contractType?: "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE" | "STARTUP";
  startDate?: string;
  endDate?: string;
}): Promise<{ error?: string }> {
  const contract = await prisma.contract.findUnique({
    where: { id: data.contractId },
    include: { project: { include: { contracts: true } } },
  });
  if (!contract) return { error: "Contract not found" };
  await requireProjectRole(contract.projectId, ["ADMIN"]);

  const effectiveType = data.contractType ?? contract.contractType;
  const isStartup = effectiveType === "STARTUP";

  const startDate = isStartup ? null : (data.startDate ? new Date(data.startDate) : contract.startDate);
  const endDate = isStartup ? null : (data.endDate ? new Date(data.endDate) : contract.endDate);

  if (!isStartup && startDate && endDate) {
    const existing = contract.project.contracts.map((c) => ({
      id: c.id,
      label: c.label,
      startDate: c.startDate,
      endDate: c.endDate,
    }));

    const dateError = validateContractDates(startDate, endDate, existing, contract.id);
    if (dateError) return { error: dateError };
  }

  await prisma.contract.update({
    where: { id: data.contractId },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.contractType && { contractType: data.contractType }),
      startDate,
      endDate,
    },
  });

  revalidatePath(`/dashboard/projects/${contract.projectId}`);
  return {};
}

export async function toggleLatePayment(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (!contract) throw new Error("Contract not found");
  await requireProjectRole(contract.projectId, ["ADMIN"]);

  await prisma.contract.update({
    where: { id: contractId },
    data: { latePayment: !contract.latePayment },
  });

  revalidatePath(`/dashboard/projects/${contract.projectId}`);
  revalidatePath("/dashboard/projects");
}

export async function inviteMember(data: {
  projectId: string;
  email: string;
  roleId: string;
}) {
  const { user, canInviteMembers, canInviteClients } = await requireMemberManagement(data.projectId);
  const email = data.email.toLowerCase().trim();

  const pRole = await prisma.projectRole.findUnique({
    where: { id: data.roleId },
  });
  if (!pRole) {
    throw new Error("Invalid role");
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { systemRole: true } });
  const isClient = existingUser?.systemRole === "CLIENT";
  if (isClient && !canInviteClients) throw new Error("You don't have permission to invite clients");
  if (!isClient && !canInviteMembers) throw new Error("You don't have permission to invite team members");

  const [invitation, project] = await Promise.all([
    prisma.invitation.create({
      data: {
        email,
        role: pRole.isAdmin ? "ADMIN" : "MEMBER",
        roleId: data.roleId,
        projectId: data.projectId,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.project.findUnique({
      where: { id: data.projectId },
      select: { name: true },
    }),
  ]);

  try {
    await fetch("https://api.clerk.com/v1/allowlist_identifiers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier: data.email, notify: false }),
    });
  } catch {
    // Non-blocking
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://amused-wonder-production-c7e9.up.railway.app";
  const inviterName = user.name || user.email;
  const projectName = project?.name || "a project";

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Nizek Project <onboarding@resend.dev>",
      to: data.email,
      subject: `You've been invited to ${projectName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
            <h2 style="margin: 0 0 8px; color: #ffffff; font-size: 20px;">You're invited!</h2>
            <p style="margin: 0 0 24px; color: #a0a0b0; font-size: 14px; line-height: 1.5;">
              <strong style="color: #ffffff;">${inviterName}</strong> has invited you to join
              <strong style="color: #4ade80;">${projectName}</strong> on Nizek Project as
              <strong style="color: #c084fc;">${pRole.name}</strong>.
            </p>
            <a href="${appUrl}/sign-in"
               style="display: inline-block; background: #4ade80; color: #0a0a0a; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Accept Invitation
            </a>
            <p style="margin: 24px 0 0; color: #666680; font-size: 12px;">
              This invitation expires in 7 days.
            </p>
          </div>
        </div>
      `,
    });
  } catch {
    // Non-blocking — invitation is still created even if email fails
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return invitation;
}

export async function removeMember(data: {
  projectId: string;
  memberId: string;
}) {
  const { canInviteMembers, canInviteClients } = await requireMemberManagement(data.projectId);

  const member = await prisma.projectMember.findUnique({
    where: { id: data.memberId },
    include: { user: { select: { systemRole: true } } },
  });
  if (!member) throw new Error("Member not found");

  const targetIsClient = member.user.systemRole === "CLIENT";
  if (targetIsClient && !canInviteClients) throw new Error("You don't have permission to manage clients");
  if (!targetIsClient && !canInviteMembers) throw new Error("You don't have permission to manage team members");

  const hasData = await prisma.task.findFirst({
    where: {
      projectId: data.projectId,
      OR: [
        { createdById: member.userId },
        { assigneeId: member.userId },
      ],
    },
    select: { id: true },
  });

  if (hasData) {
    throw new Error("Cannot remove this member — they have tasks in this project. Block them instead to preserve history.");
  }

  await prisma.projectMember.delete({
    where: { id: data.memberId },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}

export async function updateMemberRole(data: {
  projectId: string;
  memberId: string;
  roleId: string;
}) {
  await requireMemberManagement(data.projectId);

  const pRole = await prisma.projectRole.findUnique({
    where: { id: data.roleId },
  });
  if (!pRole) {
    throw new Error("Invalid role");
  }

  await prisma.projectMember.update({
    where: { id: data.memberId },
    data: {
      role: pRole.isAdmin ? "ADMIN" : "MEMBER",
      roleId: data.roleId,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}

export async function addMemberToProject(data: {
  projectId: string;
  userId: string;
  roleId: string;
}) {
  const { user, canInviteMembers, canInviteClients } = await requireMemberManagement(data.projectId);

  const pRole = await prisma.projectRole.findUnique({ where: { id: data.roleId } });
  if (!pRole) throw new Error("Invalid role");

  if (data.userId.startsWith("pending:")) {
    const inviteId = data.userId.replace("pending:", "");
    const pendingInvite = await prisma.pendingTeamInvite.findUnique({ where: { id: inviteId } });
    if (!pendingInvite) throw new Error("Pending invite not found");
    const isClient = pendingInvite.systemRole === "CLIENT";
    if (isClient && !canInviteClients) throw new Error("You don't have permission to invite clients");
    if (!isClient && !canInviteMembers) throw new Error("You don't have permission to invite team members");

    await prisma.invitation.create({
      data: {
        email: pendingInvite.email,
        role: pRole.isAdmin ? "ADMIN" : "MEMBER",
        roleId: data.roleId,
        projectId: data.projectId,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    revalidatePath(`/dashboard/projects/${data.projectId}`);
    return;
  }

  const targetUser = await prisma.user.findUnique({ where: { id: data.userId }, select: { systemRole: true } });
  if (!targetUser) throw new Error("User not found");
  const isClient = targetUser.systemRole === "CLIENT";
  if (isClient && !canInviteClients) throw new Error("You don't have permission to invite clients");
  if (!isClient && !canInviteMembers) throw new Error("You don't have permission to invite team members");

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: data.userId, projectId: data.projectId } },
  });
  if (existing) throw new Error("User is already a member of this project");

  await prisma.projectMember.create({
    data: {
      userId: data.userId,
      projectId: data.projectId,
      role: pRole.isAdmin ? "ADMIN" : "MEMBER",
      roleId: data.roleId,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}

export async function getAvailableUsers(projectId: string) {
  const [existingMembers, existingInvites] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
    prisma.invitation.findMany({ where: { projectId, status: "PENDING" }, select: { email: true } }),
  ]);
  const memberIds = new Set(existingMembers.map((m) => m.userId));
  const invitedEmails = new Set(existingInvites.map((i) => i.email));

  const [allUsers, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: { blocked: false },
      select: { id: true, name: true, email: true, imageUrl: true, systemRole: true },
      orderBy: { name: "asc" },
    }),
    prisma.pendingTeamInvite.findMany({
      select: { id: true, email: true, systemRole: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const users = allUsers
    .filter((u) => !memberIds.has(u.id))
    .map((u) => ({ ...u, isClient: u.systemRole === "CLIENT", pending: false as const }));

  const pendingUsers = pendingInvites
    .filter((p) => !invitedEmails.has(p.email) && !allUsers.some((u) => u.email === p.email))
    .map((p) => ({
      id: `pending:${p.id}`,
      name: null as string | null,
      email: p.email,
      imageUrl: null as string | null,
      isClient: p.systemRole === "CLIENT",
      pending: true as const,
    }));

  return [...users, ...pendingUsers];
}

export async function deleteProject(data: {
  projectId: string;
  confirmName: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });
  if (!project) throw new Error("Project not found");
  if (data.confirmName !== project.name) {
    throw new Error("Project name does not match");
  }

  await requireProjectRole(data.projectId, ["ADMIN"]);

  await prisma.project.delete({ where: { id: data.projectId } });
  revalidatePath("/dashboard");
}

export async function getProjectInvitations(projectId: string) {
  await requireProjectMember(projectId);

  return prisma.invitation.findMany({
    where: { projectId, status: "PENDING" },
    include: {
      invitedBy: { select: { id: true, name: true, imageUrl: true } },
      projectRole: { select: { id: true, name: true, isAdmin: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function resendInvitation(data: { projectId: string; invitationId: string }) {
  const { user } = await requireMemberManagement(data.projectId);

  const invitation = await prisma.invitation.findUnique({
    where: { id: data.invitationId },
    include: {
      project: { select: { name: true } },
      projectRole: { select: { name: true } },
    },
  });
  if (!invitation || invitation.projectId !== data.projectId) {
    throw new Error("Invitation not found");
  }

  await prisma.invitation.update({
    where: { id: data.invitationId },
    data: {
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://amused-wonder-production-c7e9.up.railway.app";
  const inviterName = user.name || user.email;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Nizek Project <onboarding@resend.dev>",
      to: invitation.email,
      subject: `Reminder: You've been invited to ${invitation.project.name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
            <h2 style="margin: 0 0 8px; color: #ffffff; font-size: 20px;">Reminder: You're invited!</h2>
            <p style="margin: 0 0 24px; color: #a0a0b0; font-size: 14px; line-height: 1.5;">
              <strong style="color: #ffffff;">${inviterName}</strong> invited you to join
              <strong style="color: #4ade80;">${invitation.project.name}</strong> on Nizek Project
              ${invitation.projectRole ? `as <strong style="color: #c084fc;">${invitation.projectRole.name}</strong>` : ""}.
            </p>
            <a href="${appUrl}/sign-in"
               style="display: inline-block; background: #4ade80; color: #0a0a0a; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Accept Invitation
            </a>
            <p style="margin: 24px 0 0; color: #666680; font-size: 12px;">
              This invitation expires in 7 days.
            </p>
          </div>
        </div>
      `,
    });
  } catch {
    // Non-blocking
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}

export async function cancelInvitation(data: { projectId: string; invitationId: string }) {
  await requireMemberManagement(data.projectId);

  await prisma.invitation.delete({
    where: { id: data.invitationId },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}

export async function updateMemberInvitePerms(data: {
  projectId: string;
  memberId: string;
  canInviteMembers?: boolean;
  canInviteClients?: boolean;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  const isSystemAdmin = user.systemRole === "ADMIN";
  const isProjectAdmin = member.projectRole?.isAdmin ?? false;
  if (!isSystemAdmin && !isProjectAdmin) throw new Error("Only admins can manage invite permissions");

  await prisma.projectMember.update({
    where: { id: data.memberId },
    data: {
      ...(data.canInviteMembers !== undefined && { canInviteMembers: data.canInviteMembers }),
      ...(data.canInviteClients !== undefined && { canInviteClients: data.canInviteClients }),
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}
