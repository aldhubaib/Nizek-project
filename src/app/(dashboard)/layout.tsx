import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { DashboardShell } from "@/components/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await getCurrentUser();
  if (user?.blocked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-foreground mb-2">Account Blocked</h1>
          <p className="text-[13px] text-muted-foreground mb-6">
            Your account has been blocked by an administrator. Contact your team admin if you think this is a mistake.
          </p>
          <SignOutButton>
            <button className="px-4 py-2 rounded-lg bg-card border border-border text-[13px] text-foreground hover:bg-card/80 transition-colors">
              Sign Out
            </button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  return <DashboardShell isAdmin={user?.systemRole === "ADMIN"} currentUserId={user?.id}>{children}</DashboardShell>;
}
