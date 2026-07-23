"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getRealUser, IMPERSONATE_COOKIE } from "@/lib/auth";

// Admin-only "sign in as user": sets an httpOnly cookie that getCurrentUser
// resolves to the target user for as long as the real Clerk session belongs
// to an admin. Purely a viewing/debugging aid — the Clerk session itself is
// untouched, and Exit simply clears the cookie.
export async function startImpersonation(userId: string): Promise<{ error?: string }> {
  const real = await getRealUser();
  if (!real || real.systemRole !== "ADMIN") {
    return { error: "Only admins can sign in as another user" };
  }
  if (real.id === userId) return { error: "You are already signed in as yourself" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, blocked: true, name: true, email: true },
  });
  if (!target) return { error: "User not found" };
  if (target.blocked) return { error: "This user is blocked — unblock them first to view as them" };

  (await cookies()).set(IMPERSONATE_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Session cookie: gone when the browser closes, and the admin can exit
    // any time via the banner.
  });
  return {};
}

export async function stopImpersonation() {
  (await cookies()).delete(IMPERSONATE_COOKIE);
}
