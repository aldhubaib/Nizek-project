"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssigneeData {
  assignee: { id: string; name: string | null; imageUrl: string | null };
  taskCount: number;
  longestMs: number;
}

function formatDuration(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ${hours % 24}h`;
  return `${days}d`;
}

function getDurationColor(ms: number) {
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= 7) return "text-red-400";
  if (days >= 5) return "text-amber-400";
  return "text-yellow-400";
}

const PREVIEW_COUNT = 5;

function AssigneeRow({ item, tab }: { item: AssigneeData; tab?: string }) {
  const color = getDurationColor(item.longestMs);
  const href = `/dashboard/needs-client-input/${item.assignee.id}${tab ? `?tab=${tab}` : ""}`;

  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
      {item.assignee.imageUrl ? (
        <img
          src={item.assignee.imageUrl}
          alt={item.assignee.name ?? ""}
          className="w-8 h-8 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">
            {(item.assignee.name ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-s font-medium truncate">
          {item.assignee.name ?? "Unassigned"}
        </p>
        <p className="text-xs text-muted-foreground">
          Longest: <span className={cn("font-mono font-semibold", color)}>{formatDuration(item.longestMs)}</span>
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-l font-bold tabular-nums text-foreground">
          {item.taskCount}
        </span>
        <span className="text-xs text-muted-foreground">
          {item.taskCount === 1 ? "task" : "tasks"}
        </span>
      </div>
    </Link>
  );
}

export function ClientInputByAssignee({ data, tab }: { data: AssigneeData[]; tab?: string }) {
  const totalTasks = data.reduce((sum, d) => sum + d.taskCount, 0);
  const preview = data.slice(0, PREVIEW_COUNT);
  const prefix = tab === "product" ? "PM" : tab === "dev" ? "Dev" : "";

  return (
    <div className="app-card rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-s font-semibold flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-muted-foreground" />
            {prefix} Needs Client Input By Assignee
          </h2>
          {totalTasks > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" />
              {totalTasks} waiting
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {data.length > 0 ? (
            <span className="text-muted-foreground">
              {data.length} {data.length === 1 ? "person" : "people"} with tasks &gt; 2d
            </span>
          ) : (
            <span className="text-muted-foreground">All clear</span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[260px]">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <UserCircle2 className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-s text-muted-foreground">No one waiting on client input</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {preview.map((item) => (
              <AssigneeRow key={item.assignee.id} item={item} tab={tab} />
            ))}
          </div>
        )}
      </div>

      <Link
        href={`/dashboard/needs-client-input${tab ? `?tab=${tab}` : ""}`}
        className="w-full px-4 py-2.5 border-t border-border text-s font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5 mt-auto"
      >
        <ExternalLink className="w-3 h-3" />
        View All ({data.length})
      </Link>
    </div>
  );
}
