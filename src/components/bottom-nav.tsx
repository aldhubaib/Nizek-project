"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  FolderKanban,
  ClipboardCheck,
  Settings,
  PieChart,
  KeyRound,
  Menu,
  Trash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInboxUnreadCount } from "@/actions/messages";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import { userChannel, NOTIFICATION_READ, NOTIFICATION_NEW } from "@/lib/channels";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
  { name: "Inbox", href: "/dashboard/messages", icon: Inbox, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
  { name: "Projects", href: "/dashboard/projects", icon: FolderKanban, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
  { name: "Vault", href: "/dashboard/vault", icon: KeyRound, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: true, trashOnly: false },
  { name: "Equity", href: "/dashboard/equity", icon: PieChart, adminOnly: false, auditOnly: false, equityOnly: true, vaultOnly: false, trashOnly: false },
  { name: "Audit", href: "/dashboard/audit", icon: ClipboardCheck, adminOnly: false, auditOnly: true, equityOnly: false, vaultOnly: false, trashOnly: false },
  { name: "Trash", href: "/dashboard/trash", icon: Trash, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: true },
  { name: "Admin", href: "/dashboard/admin", icon: Settings, adminOnly: true, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
];

const MAX_TABS = 5;

interface BottomNavProps {
  isAdmin?: boolean;
  canAudit?: boolean;
  canEquity?: boolean;
  canVault?: boolean;
  currentUserId?: string;
  onOpenMenu: () => void;
}

/**
 * Mobile/tablet bottom navigation. Inbox shows an unread badge when message
 * notifications are pending.
 */
export function BottomNav({
  isAdmin = false,
  canAudit = false,
  canEquity = false,
  canVault = false,
  currentUserId,
  onOpenMenu,
}: BottomNavProps) {
  const pathname = usePathname();
  const [inboxUnread, setInboxUnread] = useState(0);
  const cent = useCentrifugo();

  useEffect(() => {
    getInboxUnreadCount()
      .then(setInboxUnread)
      .catch(() => {});
  }, [pathname]);

  useChannel(cent && currentUserId ? userChannel(currentUserId) : null, (data) => {
    const payload = data as { type?: string };
    if (
      payload.type === NOTIFICATION_READ ||
      payload.type === NOTIFICATION_NEW ||
      payload.type === "notification" ||
      payload.type === "notification.created"
    ) {
      getInboxUnreadCount().then(setInboxUnread).catch(() => {});
    }
  });

  const canSeeTrash = canEquity || isAdmin;
  const allowed = NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.auditOnly || canAudit) &&
      (!item.equityOnly || canEquity) &&
      (!item.vaultOnly || canVault) &&
      (!item.trashOnly || canSeeTrash),
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
          const showBadge = item.name === "Inbox" && inboxUnread > 0;
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
              <span className="relative">
                <item.icon
                  className="h-5 w-5"
                  strokeWidth={active ? 2 : 1.5}
                />
                {showBadge && (
                  <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                    {inboxUnread > 9 ? "9+" : inboxUnread}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-[10px] leading-none",
                  active && "font-semibold",
                )}
              >
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
