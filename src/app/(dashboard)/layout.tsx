import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { CurrentUserProvider } from "@/components/current-user-provider";
import { getCurrentUser, getImpersonation, needsProfilePhoto, getSession } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { canAccessAnyVault } from "@/lib/vault-access";
import { getNotificationSoundUrl, getBrandingMap, brandingUrlWithBust } from "@/lib/branding";
import { isClientUser } from "@/lib/client-chat";
import { prisma } from "@/lib/prisma";
import { BlockedAccountPage } from "@/components/auth/blocked-account-page";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");

  const user = await getCurrentUser();
  if (user?.blocked) {
    return <BlockedAccountPage />;
  }

  if (await needsProfilePhoto()) {
    redirect("/setup-photo");
  }

  const isClient = isClientUser(user);
  const isAdmin = user?.systemRole === "ADMIN";

  const [notificationSoundUrl, impersonation, branding, canAudit, canEquity, canVault] =
    await Promise.all([
      getNotificationSoundUrl(),
      getImpersonation(),
      getBrandingMap(),
      isAdmin
        ? true
        : user
          ? prisma.auditPermission.count({ where: { userId: user.id } }).then((n) => n > 0)
          : false,
      canAccessEquity(user?.id),
      canAccessAnyVault(user?.id),
    ]);
  const logoUrl = branding.webLogo
    ? brandingUrlWithBust(branding, "webLogo")
    : null;

  return (
    <CurrentUserProvider
      user={
        user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              imageUrl: user.imageUrl,
            }
          : null
      }
    >
      <DashboardShell
        isAdmin={isAdmin}
        canAudit={canAudit}
        canEquity={canEquity}
        canVault={canVault}
        isClient={isClient}
        currentUserId={user?.id}
        notificationSoundUrl={notificationSoundUrl}
        logoUrl={logoUrl}
      >
        {children}
        {impersonation && <ImpersonationBanner targetName={impersonation.targetName} />}
      </DashboardShell>
    </CurrentUserProvider>
  );
}
