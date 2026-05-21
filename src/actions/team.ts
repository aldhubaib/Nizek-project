"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { SystemRole } from "@/generated/prisma/client";

export async function getTeamMembers() {
  await requireUser();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      projects: {
        include: {
          project: { select: { id: true, name: true } },
          projectRole: { select: { id: true, name: true } },
        },
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    imageUrl: u.imageUrl,
    systemRole: u.systemRole,
    createdAt: u.createdAt,
    projects: u.projects.map((p) => ({
      id: p.project.id,
      name: p.project.name,
      role: p.role,
      roleName: p.projectRole?.name ?? p.role,
    })),
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

export async function getPendingInvitations() {
  await requireUser();

  return prisma.invitation.findMany({
    where: { status: "PENDING" },
    include: {
      project: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, imageUrl: true } },
      projectRole: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProjectsWithRoles() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") return [];

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: {
      roles: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, isAdmin: true },
      },
    },
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    roles: p.roles,
  }));
}

export async function removeFromAllowlist(email: string) {
  await requireUser();

  const res = await fetch("https://api.clerk.com/v1/allowlist_identifiers", {
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });

  if (!res.ok) return;

  const data = await res.json();
  const entry = data.find(
    (item: { identifier: string }) => item.identifier === email
  );

  if (entry) {
    await fetch(
      `https://api.clerk.com/v1/allowlist_identifiers/${entry.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      }
    );
  }
}
