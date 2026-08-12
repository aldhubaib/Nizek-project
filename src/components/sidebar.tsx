"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
}: SidebarProps) {
  const pathname = usePathname();

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
      <div className="relative px-3 h-12 flex items-center justify-between shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
              N
            </div>
            <span className="font-semibold text-[13px] text-foreground truncate">
              Nizek Project
            </span>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger className="mx-auto">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary">
                N
              </div>
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
      <nav className="flex-1 py-1.5 px-2 overflow-y-auto">
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
            <Link
              href={item.href}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-full text-[13px] font-medium transition-colors mb-0.5 no-underline",
                collapsed ? "justify-center px-0 py-2" : "px-2.5 py-[7px]",
                active
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:bg-card/60 hover:text-muted-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {!collapsed && item.name}
            </Link>
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
      <div className={cn("px-2 py-2", collapsed && "px-1.5")}>
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}
