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
  Pin,
  PinOff,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: false, auditOnly: false },
  { name: "Inbox", href: "/dashboard/messages", icon: Inbox, adminOnly: false, auditOnly: false },
  { name: "Projects", href: "/dashboard/projects", icon: FolderKanban, adminOnly: false, auditOnly: false },
  { name: "Audit", href: "/dashboard/audit", icon: ClipboardCheck, adminOnly: false, auditOnly: true },
  { name: "Admin", href: "/dashboard/admin", icon: Settings, adminOnly: true, auditOnly: false },
];

interface SidebarProps {
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  isAdmin?: boolean;
  canAudit?: boolean;
}

export function Sidebar({
  collapsed = false,
  pinned = false,
  onTogglePin,
  isAdmin = false,
  canAudit = false,
}: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard")
      return pathname === "/dashboard" || pathname === "/dashboard/";
    return pathname === href || pathname.startsWith(href + "/");
  };

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
          .filter((item) => (!item.adminOnly || isAdmin) && (!item.auditOnly || canAudit))
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
