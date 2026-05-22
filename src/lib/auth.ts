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

    user = await prisma.user.create({
      data: {
        clerkId,
        email,
        name:
          `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() ||
          null,
        imageUrl: clerkUser.imageUrl,
        ...(pendingInvite && { systemRole: pendingInvite.systemRole }),
      },
    });

    if (pendingInvite) {
      await prisma.pendingTeamInvite.delete({ where: { email } });
    }
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

  if (user.systemRole === "ADMIN") {
    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user.id, projectId } },
      include: { projectRole: true },
    });
    return {
      user,
      member: member ?? {
        id: "admin",
        role: "ADMIN" as const,
        roleId: null,
        userId: user.id,
        projectId,
        createdAt: new Date(),
        projectRole: null,
      },
    };
  }

  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } },
    include: { projectRole: true },
  });
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
