import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { cache } from "react";

async function acceptPendingInvitations(userId: string, email: string) {
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

  await prisma.$transaction([
    ...(newMembers.length > 0
      ? [prisma.projectMember.createMany({
          data: newMembers.map((inv) => ({
            userId,
            projectId: inv.projectId,
            role: inv.role,
            roleId: inv.roleId,
          })),
          skipDuplicates: true,
        })]
      : []),
    prisma.invitation.updateMany({
      where: { id: { in: pending.map((inv) => inv.id) } },
      data: { status: "ACCEPTED" },
    }),
  ]);
}

export const getCurrentUser = cache(async () => {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  let user = await prisma.user.findUnique({ where: { clerkId } });

  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = (clerkUser.emailAddresses[0]?.emailAddress ?? "").toLowerCase();

    const pendingInvite = await prisma.pendingTeamInvite.findUnique({
      where: { email },
    });

    try {
      user = await prisma.user.upsert({
        where: { clerkId },
        update: {},
        create: {
          clerkId,
          email,
          name:
            `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() ||
            null,
          imageUrl: clerkUser.imageUrl,
          ...(pendingInvite && { systemRole: pendingInvite.systemRole }),
        },
      });
    } catch {
      user = await prisma.user.findUnique({ where: { clerkId } });
      if (!user) return null;
    }

    if (pendingInvite) {
      await prisma.pendingTeamInvite
        .delete({ where: { email } })
        .catch(() => {});
    }

    const { assignUserToDefaultTeam } = await import("@/actions/team");
    assignUserToDefaultTeam(user.id, user.systemRole === "CLIENT").catch(() => {});

    await acceptPendingInvitations(user.id, user.email);
  } else {
    acceptPendingInvitations(user.id, user.email).catch(() => {});

    prisma.pendingTeamInvite
      .deleteMany({ where: { email: { equals: user.email, mode: "insensitive" } } })
      .catch(() => {});
  }

  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (user.blocked) throw new Error("ACCOUNT_BLOCKED");
  return user;
}

export async function requireProjectMember(projectId: string) {
  const user = await requireUser();

  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } },
    include: { projectRole: true },
  });

  if (user.systemRole === "ADMIN") {
    return {
      user,
      member: member ?? {
        id: "admin-virtual",
        role: "ADMIN" as const,
        roleId: null,
        userId: user.id,
        projectId,
        createdAt: new Date(),
        projectRole: null,
        canInviteMembers: true,
        canInviteClients: true,
      },
    };
  }

  if (!member) throw new Error("Not a member of this project");
  return { user, member };
}

export async function requireProjectRole(projectId: string, roles: string[]) {
  const { user, member } = await requireProjectMember(projectId);
  if (user.systemRole === "ADMIN") return { user, member };
  if (!roles.includes(member.role))
    throw new Error("Insufficient permissions");
  return { user, member };
}
