import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  let user = await prisma.user.findUnique({ where: { clerkId } });

  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

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
  }

  // Auto-accept pending project invitations every time user loads
  const pendingProjectInvites = await prisma.invitation.findMany({
    where: { email: user.email, status: "PENDING" },
  });

  for (const inv of pendingProjectInvites) {
    const alreadyMember = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user.id, projectId: inv.projectId } },
    });
    if (!alreadyMember) {
      await prisma.projectMember.create({
        data: {
          userId: user.id,
          projectId: inv.projectId,
          role: inv.role,
          roleId: inv.roleId,
        },
      });
    }
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED" },
    });
  }

  return user;
}

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
