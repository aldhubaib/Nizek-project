"use client";

import { usePathname } from "next/navigation";
import { AppNavLink } from "@/components/app-nav-link";
import { UserMenu } from "@/components/user-menu";
import {
  LayoutDashboard,
  Inbox,
  FolderKanban,
  ClipboardCheck,
  Settings,
  PieChart,
  KeyRound,
  Pin,
  PinOff,
  Trash,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppLogo } from "@/components/branding-provider";
import { useUnreadStore } from "@/store/unread";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
  { name: "Inbox", href: "/dashboard/messages", icon: Inbox, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
  { name: "Projects", href: "/dashboard/projects", icon: FolderKanban, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
  { name: "Vault", href: "/dashboard/vault", icon: KeyRound, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: true, trashOnly: false },
  { name: "Equity", href: "/dashboard/equity", icon: PieChart, adminOnly: false, auditOnly: false, equityOnly: true, vaultOnly: false, trashOnly: false },
  { name: "Audit", href: "/dashboard/audit", icon: ClipboardCheck, adminOnly: false, auditOnly: true, equityOnly: false, vaultOnly: false, trashOnly: false },
  // Trash holds equity + vault soft-deletes. Equity people see equity items;
  // vault items are admin-only. Show the nav when either audience applies.
  { name: "Trash", href: "/dashboard/trash", icon: Trash, adminOnly: false, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: true },
  { name: "Admin", href: "/dashboard/admin", icon: Settings, adminOnly: true, auditOnly: false, equityOnly: false, vaultOnly: false, trashOnly: false },
];

interface SidebarProps {
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  isAdmin?: boolean;
  canAudit?: boolean;
  canEquity?: boolean;
  canVault?: boolean;
  isClient?: boolean;
  logoUrl?: string | null;
  onNavigate?: () => void;
}

export function Sidebar({
  collapsed = false,
  pinned = false,
  onTogglePin,
  isAdmin = false,
  canAudit = false,
  canEquity = false,
  canVault = false,
  isClient = false,
  logoUrl = null,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const mark = useAppLogo(logoUrl);
  const inboxUnread = useUnreadStore((s) => s.inboxUnread);

  const isActive = (href: string) => {
    if (href === "/dashboard")
      return pathname === "/dashboard" || pathname === "/dashboard/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const canSeeTrash = canEquity || isAdmin;

  return (
    <div
      className={cn(
        "flex flex-col bg-sidebar transition-all duration-200 h-screen sticky top-0 overflow-y-auto",
        collapsed ? "w-[56px] min-w-[56px]" : "w-[220px] min-w-[220px]"
      )}
    >
      {/* Header */}
      <div className="relative px-m h-12 flex items-center justify-between shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-s min-w-0 flex-1">
            <BrandMark logoUrl={mark} className="h-7 w-7" />
            <span className="font-semibold text-s text-foreground truncate">
              Nizek Project
            </span>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger className="mx-auto">
              <BrandMark logoUrl={mark} className="h-8 w-8" />
            </TooltipTrigger>
            <TooltipContent side="right">Nizek Project</TooltipContent>
          </Tooltip>
        )}

        {!collapsed && onTogglePin && (
          <Tooltip>
            <TooltipTrigger
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                pinned
                  ? "text-primary hover:bg-card/60"
                  : "text-muted-foreground hover:bg-card/60"
              )}
              onClick={onTogglePin}
            >
              {pinned ? (
                <Pin className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <PinOff className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </TooltipTrigger>
            <TooltipContent side="right">
              {pinned ? "Unpin sidebar" : "Pin sidebar"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-s overflow-y-auto px-s py-s">
        {navigation
          .filter((item) => {
            if (isClient) return item.href === "/dashboard/messages";
            return (
              (!item.adminOnly || isAdmin) &&
              (!item.auditOnly || canAudit) &&
              (!item.equityOnly || canEquity) &&
              (!item.vaultOnly || canVault) &&
              (!item.trashOnly || canSeeTrash)
            );
          })
          .map((item) => {
          const active = isActive(item.href);
          const linkContent = (
            <AppNavLink
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex w-full items-center gap-s rounded-full text-xs font-medium leading-none no-underline transition-colors",
                collapsed ? "justify-center px-0 py-s" : "px-s py-s",
                active
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:bg-card/60 hover:text-muted-foreground"
              )}
            >
              <span className="relative shrink-0">
                <item.icon className="w-4 h-4" strokeWidth={1.5} />
                {item.name === "Inbox" && inboxUnread > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                    {inboxUnread > 9 ? "9+" : inboxUnread}
                  </span>
                )}
              </span>
              {!collapsed && item.name}
            </AppNavLink>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.name}>
                <TooltipTrigger className="w-full">
                  {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right">{item.name}</TooltipContent>
              </Tooltip>
            );
          }
          return <div key={item.name}>{linkContent}</div>;
        })}
      </nav>

      {/* User */}
      <div className={cn("px-s py-s", collapsed && "px-xs")}>
        <UserMenu collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

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
        "shrink-0 rounded-full bg-primary/15 grid place-items-center text-xs font-semibold text-primary",
        className,
      )}
    >
      N
    </div>
  );
}
