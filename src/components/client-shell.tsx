"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { NotificationSound } from "@/components/notification-sound";
import { bootstrapServiceWorker } from "@/lib/service-worker-register";
import "@/lib/install-prompt-capture";
import { CentrifugoProvider } from "@/components/realtime/centrifugo-provider";
import { NotificationRealtimeProvider } from "@/components/realtime/notification-realtime-provider";
import { ClientRouteGuard } from "@/components/client-route-guard";
import { UserMenu } from "@/components/user-menu";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { useAppLogo } from "@/components/branding-provider";
import { cn } from "@/lib/utils";

const PushNotifier = dynamic(
  () => import("@/components/push-notifier").then((m) => ({ default: m.PushNotifier })),
  { ssr: false },
);
const InstallPrompt = dynamic(
  () => import("@/components/install-prompt").then((m) => ({ default: m.InstallPrompt })),
  { ssr: false },
);
const OfflineNotice = dynamic(
  () => import("@/components/offline-notice").then((m) => ({ default: m.OfflineNotice })),
  { ssr: false },
);

function BrandMark({
  logoUrl,
  className,
}: {
  logoUrl?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={cn("shrink-0 rounded-lg object-contain", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary",
        className,
      )}
    >
      N
    </div>
  );
}

export function ClientShell({
  children,
  currentUserId,
  notificationSoundUrl,
  logoUrl,
  impersonatingAs,
}: {
  children: React.ReactNode;
  currentUserId?: string;
  notificationSoundUrl?: string | null;
  logoUrl?: string | null;
  impersonatingAs?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const mark = useAppLogo(logoUrl);
  const onInbox = pathname.startsWith("/dashboard/messages");

  useEffect(() => {
    bootstrapServiceWorker();
  }, []);

  useEffect(() => {
    router.prefetch("/dashboard/messages");
    router.prefetch("/dashboard/account");
  }, [router]);

  const shell = (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background"
      data-impersonating={impersonatingAs ? "" : undefined}
    >
      <ClientRouteGuard enabled />
      {impersonatingAs && (
        <ImpersonationBanner variant="bar" targetName={impersonatingAs} />
      )}
      {!onInbox && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark logoUrl={mark} className="h-8 w-8" />
            <span className="truncate text-s font-semibold text-foreground">
              Nizek
            </span>
          </div>
          <UserMenu variant="header" />
        </header>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <NotificationSound currentUserId={currentUserId} soundUrl={notificationSoundUrl} />
      <PushNotifier />
      <InstallPrompt />
      <OfflineNotice />
    </div>
  );

  return currentUserId ? (
    <CentrifugoProvider memberId={currentUserId}>
      <NotificationRealtimeProvider currentUserId={currentUserId}>
        {shell}
      </NotificationRealtimeProvider>
    </CentrifugoProvider>
  ) : (
    shell
  );
}
