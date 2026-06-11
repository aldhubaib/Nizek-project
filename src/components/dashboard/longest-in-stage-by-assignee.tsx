"use client";

import Link from "next/link";
import { Timer, AlertTriangle, ExternalLink, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssigneeData {
  assignee: { id: string; name: string | null; imageUrl: string | null };
  lateCount: number;
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
  const href = `/dashboard/pipeline-assignee/${item.assignee.id}${tab ? `?tab=${tab}` : ""}`;

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
          <span className="text-[11px] font-semibold text-muted-foreground">
            {(item.assignee.name ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate">
          {item.assignee.name ?? "Unassigned"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Longest: <span className={cn("font-mono font-semibold", color)}>{formatDuration(item.longestMs)}</span>
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[18px] font-bold tabular-nums text-foreground">
          {item.lateCount}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {item.lateCount === 1 ? "task" : "tasks"}
        </span>
      </div>
    </Link>
  );
}

export function LongestInStageByAssignee({ data, tab, thresholdDays = 2 }: { data: AssigneeData[]; tab?: string; thresholdDays?: number }) {
  const totalLate = data.reduce((sum, d) => sum + d.lateCount, 0);
  const preview = data.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[14px] font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            {tab === "product" ? "PM" : tab === "dev" ? "Dev" : ""} Longest in Stage By Assignee
          </h2>
          {totalLate > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" />
              {totalLate} late
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {data.length > 0 ? (
            <span className="text-muted-foreground">
              {data.length} {data.length === 1 ? "person" : "people"} with tasks &gt; {thresholdDays}d
            </span>
          ) : (
            <span className="text-muted-foreground">All clear</span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[260px]">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Users className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted-foreground">No one has stalled tasks</p>
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
        href={`/dashboard/pipeline-assignee${tab ? `?tab=${tab}` : ""}`}
        className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5 mt-auto"
      >
        <ExternalLink className="w-3 h-3" />
        View All ({data.length})
      </Link>
    </div>
  );
}
