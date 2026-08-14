"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSound } from "@/components/notification-sound";
import { NotificationSync } from "@/components/notification-sync";
import { PushNotifier } from "@/components/push-notifier";
import { InstallPrompt } from "@/components/install-prompt";
import { OfflineNotice } from "@/components/offline-notice";
import { CentrifugoProvider } from "@/components/realtime/centrifugo-provider";
import { PAGE_HEADER_ACTIONS_SLOT } from "@/components/page-header-actions";
import { ClientRouteGuard } from "@/components/client-route-guard";

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
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  canAudit?: boolean;
  canEquity?: boolean;
  canVault?: boolean;
  isClient?: boolean;
  currentUserId?: string;
  notificationSoundUrl?: string | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const pathname = usePathname();
  // The inbox has its own header — hide the global notification bell there so
  // it doesn't float over the conversation.
  const onInbox = pathname.startsWith("/dashboard/messages");
  // Inside an open chat thread the composer owns the bottom edge, so the
  // bottom navigation gets out of the way (WhatsApp behavior).
  const onThread =
    pathname.startsWith("/dashboard/messages/") &&
    pathname !== "/dashboard/messages";
  // The expanded task page is a focus screen with its own back button, so the
  // navigation (sidebar rail and bottom nav) gets out of the way entirely.
  const onTaskPage = /^\/dashboard\/projects\/[^/]+\/tasks\/./.test(pathname);
  // Stay mounted on an open thread so the inbox badge can clear live; hide it
  // so the composer still owns the bottom edge.
  const showBottomNav = !isDesktop && !onTaskPage;
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

  const expanded = pinned || hovered;

  const shell = (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — pushes content, not overlay */}
      {isDesktop && !onTaskPage && (
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
          />
        </div>
      )}

      {/* Mobile header — the bell, then whatever the page puts beside it */}
      {!isDesktop && !onInbox && (
        <div className="fixed top-0 left-0 right-0 h-12 flex items-center justify-end gap-1 px-4 border-b border-border bg-background z-[100]">
          <NotificationBell currentUserId={currentUserId} />
          <div id={PAGE_HEADER_ACTIONS_SLOT} className="flex items-center gap-1" />
        </div>
      )}

      {/* Mobile drawer overlay */}
      {!isDesktop && drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[500] backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile drawer */}
      {!isDesktop && (
        <div
          className={`fixed top-0 left-0 w-[260px] h-screen bg-sidebar border-r border-sidebar-border z-[600] transition-transform duration-200 ease-out ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar
            isAdmin={isAdmin}
            canAudit={canAudit}
            canEquity={canEquity}
            canVault={canVault}
            isClient={isClient}
          />
        </div>
      )}

      {/* Main content — pushed by sidebar, rounded corner */}
      <main
        className={`flex-1 min-w-0 bg-background relative z-10 ${
          isDesktop ? (onTaskPage ? "" : "rounded-l-2xl") : onInbox ? "" : "pt-12"
        } ${bottomNavVisible && !onInbox ? "pb-[calc(4rem+env(safe-area-inset-bottom))]" : ""}`}
      >
        <ClientRouteGuard enabled={isClient} />
        {isDesktop && !onInbox && (
          <div className="fixed top-3 right-4 z-[100] flex items-center gap-1">
            <NotificationBell currentUserId={currentUserId} />
            <div
              id={PAGE_HEADER_ACTIONS_SLOT}
              className="flex items-center gap-1"
            />
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
      <NotificationSound currentUserId={currentUserId} soundUrl={notificationSoundUrl} />
      <NotificationSync currentUserId={currentUserId} />
      <PushNotifier />
      <InstallPrompt />
      <OfflineNotice />
    </div>
  );

  // Chat/inbox realtime runs over a single shared Centrifugo WebSocket for the
  // whole dashboard session. Pusher (board/task events) is untouched.
  return currentUserId ? (
    <CentrifugoProvider memberId={currentUserId}>{shell}</CentrifugoProvider>
  ) : (
    shell
  );
}
