"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSound } from "@/components/notification-sound";
import { PushNotifier } from "@/components/push-notifier";
import { InstallPrompt } from "@/components/install-prompt";
import { CentrifugoProvider } from "@/components/realtime/centrifugo-provider";
import { Menu } from "lucide-react";

const DESKTOP_BREAKPOINT = 1024;

export function DashboardShell({ children, isAdmin = false, currentUserId }: { children: React.ReactNode; isAdmin?: boolean; currentUserId?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const pathname = usePathname();
  // The inbox is a full-screen overlay with its own header — hide the global
  // notification bell there so it doesn't float over the conversation.
  const onInbox = pathname.startsWith("/dashboard/messages");

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
          />
        </div>
      )}

      {/* Mobile header */}
      {!isDesktop && (
        <div className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 border-b border-border bg-background z-[100]">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-[9px] font-semibold text-primary">
              N
            </div>
            <span className="font-semibold text-[13px] text-foreground">
              Nizek Project
            </span>
          </div>
          {onInbox ? (
            <div className="w-8 h-8" />
          ) : (
            <NotificationBell currentUserId={currentUserId} />
          )}
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
          <Sidebar isAdmin={isAdmin} />
        </div>
      )}

      {/* Main content — pushed by sidebar, rounded corner */}
      <main
        className={`flex-1 min-w-0 bg-background relative z-10 ${
          isDesktop ? "rounded-l-2xl" : "pt-12"
        }`}
      >
        {isDesktop && !onInbox && (
          <div className="fixed top-3 right-4 z-[100]">
            <NotificationBell currentUserId={currentUserId} />
          </div>
        )}
        {children}
      </main>
      <NotificationSound currentUserId={currentUserId} />
      <PushNotifier />
      <InstallPrompt />
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
