import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
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
}

// The user actually signed in with Clerk — never affected by impersonation.
export const getRealUser = cache(async () => {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  let user = await prisma.user.findUnique({ where: { clerkId } });

  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = (clerkUser.emailAddresses[0]?.emailAddress ?? "").toLowerCase();
    // Match invites against every email on the Clerk account — people are
    // often invited on one address but sign up with another.
    const allEmails = [...new Set(
      clerkUser.emailAddresses.map((e) => e.emailAddress.toLowerCase()).filter(Boolean),
    )];

    const pendingInvite = await prisma.pendingTeamInvite.findFirst({
      where: { email: { in: allEmails.length > 0 ? allEmails : [email] } },
    });

    const invitedName = pendingInvite
      ? `${pendingInvite.firstName ?? ""} ${pendingInvite.lastName ?? ""}`.trim()
      : "";
    const clerkName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();

    try {
      user = await prisma.user.upsert({
        where: { clerkId },
        update: {},
        create: {
          clerkId,
          email,
          name: invitedName || clerkName || null,
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
        .deleteMany({ where: { email: { in: allEmails.length > 0 ? allEmails : [email] } } })
        .catch(() => {});
    }

    const { assignUserToDefaultTeam } = await import("@/actions/team");
    assignUserToDefaultTeam(user.id, user.systemRole === "CLIENT").catch(() => {});

    for (const em of allEmails.length > 0 ? allEmails : [user.email]) {
      await acceptPendingInvitations(user.id, em);
    }
  }
  // NOTE: For existing users we intentionally do NOT run invitation acceptance or
  // pendingTeamInvite cleanup here — that used to run on every dashboard request.
  // Invitations that arrive after signup are reconciled lazily in getProjects()
  // (the projects list entry point) via acceptPendingInvitations().

  return user;
});

// Effective user for the request. If a system admin has an active
// "sign in as" cookie, this resolves to the impersonated user, so every
// query/permission check in the app behaves exactly as it would for them.
// The cookie is only honored when the real Clerk session belongs to an
// admin, so a tampered cookie does nothing for regular users.
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

// Impersonation state for the banner: null unless an admin is actively
// viewing the app as someone else.
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

// Wrapped in React cache() so repeated calls within a single request/render
// (e.g. getProject + getTasksByProject + page loader all check membership)
// hit the DB only once per projectId.
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
