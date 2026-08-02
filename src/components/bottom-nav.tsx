"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  FolderKanban,
  ClipboardCheck,
  Settings,
  PieChart,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Same items + permission flags as the desktop sidebar.
const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: false, auditOnly: false, equityOnly: false },
  { name: "Inbox", href: "/dashboard/messages", icon: Inbox, adminOnly: false, auditOnly: false, equityOnly: false },
  { name: "Projects", href: "/dashboard/projects", icon: FolderKanban, adminOnly: false, auditOnly: false, equityOnly: false },
  { name: "Equity", href: "/dashboard/equity", icon: PieChart, adminOnly: false, auditOnly: false, equityOnly: true },
  { name: "Audit", href: "/dashboard/audit", icon: ClipboardCheck, adminOnly: false, auditOnly: true, equityOnly: false },
  { name: "Admin", href: "/dashboard/admin", icon: Settings, adminOnly: true, auditOnly: false, equityOnly: false },
];

// Tabs shown at once, including the trailing Menu tab.
const MAX_TABS = 5;

interface BottomNavProps {
  isAdmin?: boolean;
  canAudit?: boolean;
  canEquity?: boolean;
  /** Opens the drawer with the full sidebar (account, plus any overflow items). */
  onOpenMenu: () => void;
}

/**
 * Mobile/tablet bottom navigation. Applies the same permission filtering as
 * the sidebar. The Inbox tab is always kept visible; if there are ever more
 * items than tab slots, the extras stay reachable through the Menu drawer.
 */
export function BottomNav({ isAdmin = false, canAudit = false, canEquity = false, onOpenMenu }: BottomNavProps) {
  const pathname = usePathname();

  const allowed = NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.auditOnly || canAudit) && (!item.equityOnly || canEquity),
  );
  let visible = allowed.slice(0, MAX_TABS - 1);
  const inbox = allowed.find((item) => item.name === "Inbox");
  if (inbox && !visible.includes(inbox)) {
    visible = [...visible.slice(0, -1), inbox];
  }

  const isActive = (href: string) => {
    if (href === "/dashboard")
      return pathname === "/dashboard" || pathname === "/dashboard/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[400] border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="flex h-16 items-stretch">
        {visible.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 no-underline transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon
                className="h-5 w-5"
                strokeWidth={active ? 2 : 1.5}
              />
              <span className={cn("text-[10px] leading-none", active && "font-semibold")}>
                {item.name}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-[10px] leading-none">Menu</span>
        </button>
      </div>
    </nav>
  );
}
