"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { Menu } from "lucide-react";

const DESKTOP_BREAKPOINT = 1024;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

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

  return (
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
          <div className="w-8" />
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
          <Sidebar />
        </div>
      )}

      {/* Main content — pushed by sidebar, rounded corner */}
      <main
        className={`flex-1 min-w-0 bg-background relative z-10 ${
          isDesktop ? "rounded-l-2xl" : "pt-12"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
