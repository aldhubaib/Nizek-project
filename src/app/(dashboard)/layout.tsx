import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ClientShell } from "@/components/client-shell";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { CurrentUserProvider } from "@/components/current-user-provider";
import { headers } from "next/headers";
import { getCurrentUser, getImpersonation, needsProfilePhoto, getSession } from "@/lib/auth";
import { canAccessEquity } from "@/lib/equity-access";
import { canAccessAnyVault } from "@/lib/vault-access";
import { getNotificationSoundUrl, getBrandingMap, brandingUrlWithBust } from "@/lib/branding";
import { isClientUser } from "@/lib/client-chat";
import { isClientAllowedPath } from "@/lib/client-routes";
import { pendingAgreementFor } from "@/lib/client-agreement";
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

  // Clients only: they cannot reach their chat until they have accepted the
  // agreement version currently in force. Publishing a new one brings everybody
  // back through here.
  if (await pendingAgreementFor(user)) {
    redirect("/agreement");
  }

  const isClient = isClientUser(user);
  const isAdmin = user?.systemRole === "ADMIN";
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (isClient && pathname.startsWith("/dashboard") && !isClientAllowedPath(pathname)) {
    redirect("/dashboard/messages");
  }

  const [notificationSoundUrl, impersonation, branding, canAudit, canEquity, canVault] =
    await Promise.all([
      getNotificationSoundUrl(),
      getImpersonation(),
      getBrandingMap(),
      isClient || isAdmin
        ? Promise.resolve(isAdmin)
        : user
          ? prisma.auditPermission.count({ where: { userId: user.id } }).then((n) => n > 0)
          : false,
      isClient ? Promise.resolve(false) : canAccessEquity(user?.id),
      isClient ? Promise.resolve(false) : canAccessAnyVault(user?.id),
    ]);
  const logoUrl = branding.webLogo
    ? brandingUrlWithBust(branding, "webLogo")
    : null;

  const banner = impersonation ? (
    <ImpersonationBanner targetName={impersonation.targetName} />
  ) : null;

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
      {isClient ? (
        <ClientShell
          currentUserId={user?.id}
          notificationSoundUrl={notificationSoundUrl}
          logoUrl={logoUrl}
          impersonatingAs={impersonation?.targetName ?? null}
        >
          {children}
        </ClientShell>
      ) : (
        <DashboardShell
          isAdmin={isAdmin}
          canAudit={canAudit}
          canEquity={canEquity}
          canVault={canVault}
          currentUserId={user?.id}
          notificationSoundUrl={notificationSoundUrl}
          logoUrl={logoUrl}
        >
          {children}
          {banner}
        </DashboardShell>
      )}
    </CurrentUserProvider>
  );
}
