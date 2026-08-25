"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationSound } from "@/components/notification-sound";
import { PushNotifier } from "@/components/push-notifier";
import { InstallPrompt } from "@/components/install-prompt";
import { OfflineNotice } from "@/components/offline-notice";
import { CentrifugoProvider } from "@/components/realtime/centrifugo-provider";
import { NotificationRealtimeProvider } from "@/components/realtime/notification-realtime-provider";
import { PAGE_HEADER_ACTIONS_SLOT } from "@/components/page-header-actions";
import {
  PageOverflowMenu,
  PageOverflowMenuProvider,
} from "@/components/page-overflow-menu";
import { ClientRouteGuard } from "@/components/client-route-guard";
import { useHideHeaderOnScroll } from "@/hooks/use-hide-header-on-scroll";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { ProofUploadToast } from "@/components/kanban/proof-upload-toast";

const DESKTOP_BREAKPOINT = 1024;

export function DashboardShell({
  children,
  isAdmin = false,
  canAudit = false,
  canEquity = false,
  canVault = false,
  isClient = false,
  currentUserId,
  notificationSoundUrl,
  logoUrl,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  canAudit?: boolean;
  canEquity?: boolean;
  canVault?: boolean;
  isClient?: boolean;
  currentUserId?: string;
  notificationSoundUrl?: string | null;
  logoUrl?: string | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  useScrollLock(drawerOpen && !isDesktop);
  const pathname = usePathname();
  const onInbox = pathname.startsWith("/dashboard/messages");
  // Inside an open chat thread the composer owns the bottom edge, so the
  // bottom navigation gets out of the way (WhatsApp behavior).
  const onThread =
    pathname.startsWith("/dashboard/messages/") &&
    pathname !== "/dashboard/messages";
  // Stay mounted on an open thread so the inbox badge can clear live; hide it
  // so the composer still owns the bottom edge.
  const showBottomNav = !isDesktop;
  const bottomNavVisible = showBottomNav && !onThread;

  useEffect(() => {
    const handleResize = () =>
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (isDesktop && drawerOpen) setDrawerOpen(false);
  }, [isDesktop, drawerOpen]);

  useHideHeaderOnScroll(true);

  const expanded = pinned || hovered;

  const headerActions = (
    <>
      <div id={PAGE_HEADER_ACTIONS_SLOT} className="flex items-center gap-xs" />
      <PageOverflowMenu />
    </>
  );

  const shell = (
    <PageOverflowMenuProvider>
      <div className="flex min-h-screen">
      {/* Desktop sidebar — pushes content, not overlay */}
      {isDesktop && (
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <Sidebar
            collapsed={!expanded}
            pinned={pinned}
            onTogglePin={() => setPinned(!pinned)}
            isAdmin={isAdmin}
            canAudit={canAudit}
            canEquity={canEquity}
            canVault={canVault}
            isClient={isClient}
            logoUrl={logoUrl}
          />
        </div>
      )}

      {/* Page actions + ⋮ overlay the page's own header instead of stacking a second bar. */}
      {!isDesktop && (
        <div className="app-shell-chrome fixed top-0 right-0 z-[100] flex app-top-bar items-center gap-xs bg-transparent pb-5">
          {headerActions}
        </div>
      )}

      {/* Mobile drawer overlay */}
      {!isDesktop && drawerOpen && (
        <div
          className="fixed inset-0 bg-overlay z-[500] backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile drawer */}
      {!isDesktop && (
        <div
          {...(drawerOpen ? { "data-scroll-lock-root": "" } : {})}
          className={`fixed top-0 left-0 w-[220px] h-screen overflow-y-auto overscroll-contain bg-sidebar border-r border-sidebar-border z-[600] transition-transform duration-200 ease-out ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar
            isAdmin={isAdmin}
            canAudit={canAudit}
            canEquity={canEquity}
            canVault={canVault}
            isClient={isClient}
            logoUrl={logoUrl}
          />
        </div>
      )}

      {/* Main content — pushed by sidebar, rounded corner */}
      <main
        className={`flex-1 min-w-0 bg-background relative z-10 ${
          isDesktop ? "rounded-l-2xl" : ""
        } ${bottomNavVisible && !onInbox ? "app-has-bottom-nav" : ""}`}
      >
        <ClientRouteGuard enabled={isClient} />
        {isDesktop && (
          <div className="app-shell-chrome fixed top-3 right-l z-[100] flex items-center gap-xs">
            {headerActions}
          </div>
        )}
        {children}
      </main>

      {/* Mobile/tablet bottom navigation — same permission rules as the sidebar */}
      {showBottomNav && (
        <BottomNav
          isAdmin={isAdmin}
          canAudit={canAudit}
          canEquity={canEquity}
          canVault={canVault}
          isClient={isClient}
          currentUserId={currentUserId}
          hidden={!bottomNavVisible}
          onOpenMenu={() => setDrawerOpen(true)}
        />
      )}
      <ProofUploadToast />
      <NotificationSound currentUserId={currentUserId} soundUrl={notificationSoundUrl} />
      <PushNotifier />
      <InstallPrompt />
      <OfflineNotice />
      </div>
    </PageOverflowMenuProvider>
  );

  // Chat/inbox realtime runs over a single shared Centrifugo WebSocket for the
  // whole dashboard session. Pusher (board/task events) is untouched.
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
