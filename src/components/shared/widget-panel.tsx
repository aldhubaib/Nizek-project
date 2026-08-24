"use client";

import { memo, type ReactNode } from "react";

interface WidgetPanelProps {
  title: string;
  icon: ReactNode;
  badge?: number;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}

export const WidgetPanel = memo(function WidgetPanel({
  title,
  icon,
  badge,
  action,
  children,
}: WidgetPanelProps) {
  return (
    <div className="app-card rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-s font-semibold">{title}</h3>
          {badge !== undefined && badge > 0 && (
            <span className="ms-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {badge}
            </span>
          )}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="text-xs text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="p-4 max-h-[320px] overflow-y-auto">{children}</div>
    </div>
  );
});
