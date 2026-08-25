import { headers, cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth-server";
import { cache } from "react";
import { applyPendingInvite, logPendingInviteError } from "@/lib/pending-invite";

export { acceptPendingInvitations, applyPendingInvite } from "@/lib/pending-invite";

export const IMPERSONATE_COOKIE = "impersonate_user_id";

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
  if (!user) return null;

  try {
    const { userMutated } = await applyPendingInvite(user.id, user.email);
    if (userMutated) {
      return prisma.user.findUnique({ where: { id: user.id } });
    }
  } catch (error) {
    logPendingInviteError("Reconciliation on session failed; will retry next request", {
      userId: user.id,
      email: user.email,
      error,
    });
  }

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
