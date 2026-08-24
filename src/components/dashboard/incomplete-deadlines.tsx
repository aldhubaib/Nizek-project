"use client";

import Link from "next/link";
import { CalendarClock, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IncompleteDeadlineRow } from "@/actions/deadline-reminder";

const PREVIEW_COUNT = 5;

function statusFor(daysUntil: number) {
  if (daysUntil < 0) {
    return {
      label: `${Math.abs(daysUntil)}d overdue`,
      color: "text-destructive",
      bg: "bg-destructive/10 border-destructive/20",
    };
  }
  if (daysUntil === 0) {
    return {
      label: "Due today",
      color: "text-orange",
      bg: "bg-orange/10 border-orange/20",
    };
  }
  if (daysUntil <= 10) {
    return {
      label: `${daysUntil}d left`,
      color: "text-orange",
      bg: "bg-orange/10 border-orange/20",
    };
  }
  return {
    label: `${daysUntil}d left`,
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
  };
}

function DeadlineRow({ item }: { item: IncompleteDeadlineRow }) {
  const status = statusFor(item.daysUntil);
  const href = `/dashboard/projects/${item.project.id}?tab=sprints`;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors"
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
        <CalendarClock className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-s font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.project.name}</p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
          status.bg,
          status.color,
        )}
      >
        {status.label}
      </span>
    </Link>
  );
}

export function IncompleteDeadlines({ data }: { data: IncompleteDeadlineRow[] }) {
  const overdueCount = data.filter((d) => d.daysUntil < 0).length;
  const preview = data.slice(0, PREVIEW_COUNT);

  return (
    <div className="app-card flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-s font-semibold">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Incomplete Roadmap
          </h2>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {data.length > 0 ? (
            <span className="text-muted-foreground">
              {data.length} open item{data.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-muted-foreground">All clear</span>
          )}
        </div>
      </div>

      <div className="min-h-[260px] flex-1">
        {data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <CalendarClock
              className="mb-2 h-7 w-7 text-muted-foreground/20"
              strokeWidth={1.5}
            />
            <p className="text-s text-muted-foreground">No deadlines found</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {preview.map((item) => (
              <DeadlineRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <Link
        href="/dashboard/deadlines"
        className="mt-auto flex w-full items-center justify-center gap-xs border-t border-border px-4 py-2.5 text-s font-medium text-primary transition-colors hover:bg-accent/30"
      >
        <ExternalLink className="h-3 w-3" />
        View All ({data.length})
      </Link>
    </div>
  );
}
