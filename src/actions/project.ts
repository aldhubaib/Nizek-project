"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireProjectMember, requireProjectRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

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

  const allStages = JSON.stringify([
    "NEW_REQUEST", "CLARIFICATION", "READY_FOR_DEV", "IN_DEVELOPMENT",
    "INTERNAL_REVIEW", "CLIENT_REVIEW", "READY_FOR_RELEASE", "DONE",
  ]);
  const devStages = JSON.stringify(["IN_DEVELOPMENT", "INTERNAL_REVIEW"]);
  const clientStages = JSON.stringify(["NEW_REQUEST"]);

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
      roles: {
        create: [
          { name: "Admin", isAdmin: true, canCreateTask: true, canModifyTask: true, canMoveTask: true, allowedStages: allStages },
          { name: "Project Manager", isAdmin: false, canCreateTask: true, canModifyTask: true, canMoveTask: true, allowedStages: allStages },
          { name: "Developer", isAdmin: false, canCreateTask: false, canModifyTask: true, canMoveTask: true, allowedStages: devStages },
          { name: "Client", isAdmin: false, canCreateTask: true, canModifyTask: false, canMoveTask: false, allowedStages: clientStages },
        ],
      },
    },
    include: { roles: true },
  });

  const adminRole = project.roles.find((r) => r.isAdmin);
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
  return prisma.project.findMany({
    where: { members: { some: { userId: user.id } } },
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
      roles: true,
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
  if (!pRole || pRole.projectId !== data.projectId) {
    throw new Error("Invalid role");
  }

  const invitation = await prisma.invitation.create({
    data: {
      email: data.email,
      role: pRole.isAdmin ? "ADMIN" : "MEMBER",
      roleId: data.roleId,
      projectId: data.projectId,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

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
    // Non-blocking — user can still be added manually if this fails
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
  if (!pRole || pRole.projectId !== data.projectId) {
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
  await requireProjectRole(data.projectId, ["ADMIN"]);

  const invitation = await prisma.invitation.findUnique({
    where: { id: data.invitationId },
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

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}

export async function cancelInvitation(data: { projectId: string; invitationId: string }) {
  await requireProjectRole(data.projectId, ["ADMIN"]);

  await prisma.invitation.delete({
    where: { id: data.invitationId },
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
}
