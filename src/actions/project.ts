"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireProjectMember, requireProjectRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";

export async function createProject(data: {
  name: string;
  description?: string;
  projectType?: "FULL_TEAM" | "PART_TEAM" | "FIXED" | "MAINTENANCE";
  contract: {
    label?: string;
    startDate: string;
    endDate: string;
  };
}) {
  const user = await requireUser();

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
      projectType: data.projectType ?? "FULL_TEAM",
      contracts: {
        create: {
          label: data.contract.label,
          startDate: new Date(data.contract.startDate),
          endDate: new Date(data.contract.endDate),
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
      contracts: true,
      members: { include: { user: true, projectRole: true } },
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
      members: { include: { user: true, projectRole: true } },
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
}) {
  await requireProjectRole(data.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  const updated = await prisma.project.update({
    where: { id: data.projectId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return updated;
}

export async function addContract(data: {
  projectId: string;
  label?: string;
  startDate: string;
  endDate: string;
}) {
  await requireProjectRole(data.projectId, ["ADMIN"]);

  const contract = await prisma.contract.create({
    data: {
      label: data.label,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      projectId: data.projectId,
    },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return contract;
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

export async function inviteMember(data: {
  projectId: string;
  email: string;
  roleId: string;
}) {
  const { user } = await requireProjectRole(data.projectId, ["ADMIN"]);

  const pRole = await prisma.projectRole.findUnique({
    where: { id: data.roleId },
  });
  if (!pRole) {
    throw new Error("Invalid role");
  }

  const [invitation, project] = await Promise.all([
    prisma.invitation.create({
      data: {
        email: data.email,
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
  await requireProjectRole(data.projectId, ["ADMIN"]);

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
  await requireProjectRole(data.projectId, ["ADMIN"]);

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
  await requireProjectRole(data.projectId, ["ADMIN"]);

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: data.userId, projectId: data.projectId } },
  });
  if (existing) throw new Error("User is already a member of this project");

  const pRole = await prisma.projectRole.findUnique({ where: { id: data.roleId } });
  if (!pRole) throw new Error("Invalid role");

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
  const existingMemberIds = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  const ids = new Set(existingMemberIds.map((m) => m.userId));

  const allUsers = await prisma.user.findMany({
    where: { blocked: false },
    select: { id: true, name: true, email: true, imageUrl: true },
    orderBy: { name: "asc" },
  });

  return allUsers.filter((u) => !ids.has(u.id));
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
  const { user } = await requireProjectRole(data.projectId, ["ADMIN"]);

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
  await requireProjectRole(data.projectId, ["ADMIN"]);

  await prisma.invitation.delete({
    where: { id: data.invitationId },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}
