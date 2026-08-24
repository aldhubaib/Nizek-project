"use client";

import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  color?: string;
}

export const StatCard = memo(function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="app-card rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={cn("opacity-70", color)}>{icon}</span>
      </div>
      <p className="text-l font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
});
