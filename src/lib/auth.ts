import { headers, cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth-server";
import { cache } from "react";

export const IMPERSONATE_COOKIE = "impersonate_user_id";

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

  if (newMembers.length > 0) {
    const { syncClientConversationParticipants } = await import("@/lib/client-chat");
    const projectIds = [...new Set(newMembers.map((m) => m.projectId))];
    const enabled = await prisma.project.findMany({
      where: { id: { in: projectIds }, clientChatEnabled: true },
      select: { id: true },
    });
    await Promise.all(
      enabled.map((p) => syncClientConversationParticipants(p.id).catch(() => {})),
    );
  }
}

/**
 * Get the current Better Auth session. Returns null if not authenticated.
 * Cached per-request via React cache().
 */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
});

export const getRealUser = cache(async () => {
  const session = await getSession();
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  return user;
});

export const getCurrentUser = cache(async () => {
  const real = await getRealUser();
  if (!real) return null;
  if (real.systemRole !== "ADMIN") return real;

  const targetId = (await cookies()).get(IMPERSONATE_COOKIE)?.value;
  if (!targetId || targetId === real.id) return real;

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.blocked) return real;
  return target;
});

export const getImpersonation = cache(async () => {
  const [real, effective] = await Promise.all([getRealUser(), getCurrentUser()]);
  if (!real || !effective || real.id === effective.id) return null;
  return {
    realName: real.name ?? real.email,
    targetId: effective.id,
    targetName: effective.name ?? effective.email,
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (user.blocked) throw new Error("ACCOUNT_BLOCKED");
  return user;
}

/**
 * True when the user has no profile photo. We check our own DB field
 * instead of relying on Clerk's hasImage.
 */
export async function needsProfilePhoto(): Promise<boolean> {
  const impersonation = await getImpersonation();
  if (impersonation) return false;
  const user = await getRealUser();
  if (!user) return false;
  return !user.imageUrl;
}

export const requireProjectMember = cache(async (projectId: string) => {
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
});

export async function requireProjectRole(projectId: string, roles: string[]) {
  const { user, member } = await requireProjectMember(projectId);
  if (user.systemRole === "ADMIN") return { user, member };
  if (!roles.includes(member.role))
    throw new Error("Insufficient permissions");
  return { user, member };
}
