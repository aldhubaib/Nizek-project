"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  meta?: string;
  count?: number;
  /** Extra content rendered after the count (e.g. task type summary). */
  extra?: React.ReactNode;
  actions?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  meta,
  count,
  extra,
  actions,
  collapsed = false,
  onToggle,
  children,
  className,
}: CollapsibleSectionProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border/50 bg-card px-3 pb-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-1 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
        <h2 className="text-s font-semibold">{title}</h2>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        {count != null && (
          <span className="text-xs text-muted-foreground">{count}</span>
        )}
        {extra}
        {actions && (
          <div className="ms-auto flex items-center gap-2">{actions}</div>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}
