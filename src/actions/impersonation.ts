"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getRealUser, IMPERSONATE_COOKIE } from "@/lib/auth";
import { provisionUserFromPendingInvite } from "@/lib/pending-invite";
import { isClientAccount, promoteUserToClient } from "@/lib/client-role";

async function setImpersonationCookie(userId: string) {
  (await cookies()).set(IMPERSONATE_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Session cookie: gone when the browser closes, and the admin can exit
    // any time via the banner.
  });
}

async function redirectFor(userId: string, systemRole: string) {
  const isClient =
    systemRole === "CLIENT" || (await isClientAccount(userId));
  if (isClient) {
    await promoteUserToClient(userId);
    return "/dashboard/messages";
  }
  return "/dashboard";
}

// Admin-only "sign in as user": sets an httpOnly cookie that getCurrentUser
// resolves to the target user for as long as the real session belongs to an
// admin. Purely a viewing/debugging aid — the auth session itself is
// untouched, and Exit simply clears the cookie.
export async function startImpersonation(
  userId: string,
): Promise<{ error?: string; redirectTo?: string }> {
  const real = await getRealUser();
  if (!real || real.systemRole !== "ADMIN") {
    return { error: "Only admins can sign in as another user" };
  }
  if (real.id === userId) return { error: "You are already signed in as yourself" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, blocked: true, systemRole: true },
  });
  if (!target) return { error: "User not found" };
  if (target.blocked) return { error: "This user is blocked — unblock them first to view as them" };

  await setImpersonationCookie(target.id);
  return { redirectTo: await redirectFor(target.id, target.systemRole) };
}

/** View as a pending invitee before they sign in with Google. */
export async function startImpersonationByEmail(
  email: string,
): Promise<{ error?: string; redirectTo?: string }> {
  const real = await getRealUser();
  if (!real || real.systemRole !== "ADMIN") {
    return { error: "Only admins can sign in as another user" };
  }

  const provisioned = await provisionUserFromPendingInvite(email);
  if ("error" in provisioned) return { error: provisioned.error };
  if (provisioned.userId === real.id) {
    return { error: "You are already signed in as yourself" };
  }

  const target = await prisma.user.findUnique({
    where: { id: provisioned.userId },
    select: { id: true, blocked: true, systemRole: true },
  });
  if (!target) return { error: "User not found" };
  if (target.blocked) return { error: "This user is blocked — unblock them first to view as them" };

  await setImpersonationCookie(target.id);
  return { redirectTo: await redirectFor(target.id, target.systemRole) };
}

export async function stopImpersonation() {
  (await cookies()).delete(IMPERSONATE_COOKIE);
}
