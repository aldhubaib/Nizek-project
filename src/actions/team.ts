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
    blocked: u.blocked,
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

export async function inviteToTeam(data: {
  email: string;
  systemRole: SystemRole;
  projectId?: string;
  roleId?: string;
}) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can invite team members");
  }

  await prisma.pendingTeamInvite.upsert({
    where: { email: data.email },
    update: { systemRole: data.systemRole },
    create: { email: data.email, systemRole: data.systemRole },
  });

  if (data.systemRole === "CLIENT" && data.projectId && data.roleId) {
    const { inviteMember } = await import("@/actions/project");
    await inviteMember({
      projectId: data.projectId,
      email: data.email,
      roleId: data.roleId,
    });
  } else {
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

    const { Resend } = await import("resend");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://amused-wonder-production-c7e9.up.railway.app";
    const inviterName = currentUser.name || currentUser.email;
    const roleLabel = data.systemRole.replace("_", " ");

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Nizek Project <onboarding@resend.dev>",
        to: data.email,
        subject: "You've been invited to Nizek Project",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
              <h2 style="margin: 0 0 8px; color: #ffffff; font-size: 20px;">You're invited!</h2>
              <p style="margin: 0 0 24px; color: #a0a0b0; font-size: 14px; line-height: 1.5;">
                <strong style="color: #ffffff;">${inviterName}</strong> has invited you to join
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
    } catch {
      // Non-blocking
    }
  }

  revalidatePath("/dashboard/team");
}

export async function getPendingTeamInvites() {
  await requireUser();
  return prisma.pendingTeamInvite.findMany({
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

export async function cancelTeamInvite(inviteId: string) {
  const currentUser = await requireUser();
  if (currentUser.systemRole !== "ADMIN") {
    throw new Error("Only admins can cancel invitations");
  }

  const invite = await prisma.pendingTeamInvite.findUnique({
    where: { id: inviteId },
  });
  if (!invite) throw new Error("Invite not found");

  await prisma.pendingTeamInvite.delete({ where: { id: inviteId } });

  try {
    const res = await fetch("https://api.clerk.com/v1/allowlist_identifiers", {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    if (res.ok) {
      const data = await res.json();
      const entry = data.find(
        (item: { identifier: string }) => item.identifier === invite.email
      );
      if (entry) {
        await fetch(`https://api.clerk.com/v1/allowlist_identifiers/${entry.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
        });
      }
    }
  } catch {
    // Non-blocking
  }

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

export async function toggleBlockUser(userId: string) {
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

  await prisma.user.update({
    where: { id: userId },
    data: { blocked: newBlocked },
  });

  try {
    if (newBlocked) {
      await fetch(`https://api.clerk.com/v1/users/${target.clerkId}/ban`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      });
    } else {
      await fetch(`https://api.clerk.com/v1/users/${target.clerkId}/unban`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      });
    }
  } catch {
    // Non-blocking — DB state is the source of truth
  }

  revalidatePath("/dashboard/team");
  return newBlocked;
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
