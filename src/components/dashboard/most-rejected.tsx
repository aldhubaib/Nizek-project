"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ThumbsDown, X, ExternalLink, AlertTriangle, Users, UserX, Sparkles, Zap, Bug, AlertCircle, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface RejectedTask {
  task: {
    id: string;
    title: string;
    taskNumber: number;
    taskType: string;
    stage: string;
    projectId: string;
    project: { id: string; name: string };
    assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  };
  internalCount: number;
  clientCount: number;
  totalCount: number;
  lastRejectedAt: string;
  lastRejectedBy: { id: string; name: string | null; imageUrl: string | null };
}

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary bg-primary/10 border-primary/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const STAGE_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  CLARIFICATION: "Clarification",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  DONE: "Done",
};

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-popover border border-border text-xs text-popover-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
      </div>
    </div>
  );
}

function getCountColor(count: number) {
  if (count >= 5) return "text-destructive bg-destructive/10 border-destructive/20";
  if (count >= 3) return "text-orange bg-orange/10 border-orange/20";
  return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
}

function getBarWidth(count: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(4, (count / max) * 100));
}

const PREVIEW_COUNT = 5;

function CompactRow({ item, maxCount }: { item: RejectedTask; maxCount: number }) {
  const typeInfo = TASK_TYPE_ICONS[item.task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;
  const barW = getBarWidth(item.totalCount, maxCount);

  return (
    <Link
      href={`/dashboard/projects/${item.task.project.id}/tasks/${item.task.id}`}
      target="_blank"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group"
    >
      <Tooltip text={typeInfo?.label ?? item.task.taskType}>
        <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
          <TypeIcon className="w-3 h-3" />
        </div>
      </Tooltip>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-s font-medium truncate group-hover:text-primary transition-colors">
              <span className="text-muted-foreground/50 font-mono me-1">#{item.task.taskNumber}</span>
              {item.task.title}
            </p>
            <p className="text-xs text-muted-foreground/50 truncate">{item.task.project.name}</p>
          </div>
          <div className="flex items-center gap-xs shrink-0">
            {item.internalCount > 0 && (
              <Tooltip text={`${item.internalCount} internal rejection${item.internalCount !== 1 ? "s" : ""}`}>
                <span className="flex items-center gap-0.5 text-xs font-bold text-orange">
                  <Users className="w-3 h-3" />
                  {item.internalCount}
                </span>
              </Tooltip>
            )}
            {item.clientCount > 0 && (
              <Tooltip text={`${item.clientCount} client rejection${item.clientCount !== 1 ? "s" : ""}`}>
                <span className="flex items-center gap-0.5 text-xs font-bold text-destructive">
                  <UserX className="w-3 h-3" />
                  {item.clientCount}
                </span>
              </Tooltip>
            )}
            <span className={cn("text-xs font-bold tabular-nums rounded-full px-1.5 py-0 border", getCountColor(item.totalCount))}>
              {item.totalCount}
            </span>
          </div>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div className="h-full rounded-full bg-destructive transition-all" style={{ width: `${barW}%` }} />
        </div>
      </div>
    </Link>
  );
}

function FullRow({ item }: { item: RejectedTask }) {
  const typeInfo = TASK_TYPE_ICONS[item.task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${item.task.project.id}/tasks/${item.task.id}`}
      target="_blank"
      className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_100px_70px_70px_70px_100px] gap-3 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Tooltip text={typeInfo?.label ?? item.task.taskType}>
          <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
        </Tooltip>
        <div className="min-w-0">
          <p className="text-s font-medium truncate group-hover:text-primary transition-colors">{item.task.title}</p>
          <p className="text-xs text-muted-foreground/50">
            <span className="font-mono">#{item.task.taskNumber}</span>
            <span className="mx-1">·</span>
            {item.task.project.name}
          </p>
        </div>
      </div>

      <span className="text-xs text-muted-foreground truncate @max-md/card:hidden">{STAGE_LABELS[item.task.stage] ?? item.task.stage}</span>

      <div className="flex justify-center @max-md/card:hidden">
        <span className="flex items-center gap-0.5 text-s font-bold text-orange">
          <Users className="w-3 h-3" />
          {item.internalCount}
        </span>
      </div>

      <div className="flex justify-center @max-md/card:hidden">
        <span className="flex items-center gap-0.5 text-s font-bold text-destructive">
          <UserX className="w-3 h-3" />
          {item.clientCount}
        </span>
      </div>

      <div className="flex justify-center">
        <span className={cn("text-s font-bold tabular-nums rounded-full px-2 py-0.5 border", getCountColor(item.totalCount))}>
          {item.totalCount}
        </span>
      </div>

      <div className="text-end @max-md/card:hidden">
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(item.lastRejectedAt), { addSuffix: true })}
        </span>
      </div>
    </Link>
  );
}

export function MostRejected({ data }: { data: RejectedTask[] }) {
  const [showAll, setShowAll] = useState(false);

  const totalInternal = data.reduce((s, d) => s + d.internalCount, 0);
  const totalClient = data.reduce((s, d) => s + d.clientCount, 0);
  const highReject = data.filter((d) => d.totalCount >= 3).length;
  const maxCount = data.length > 0 ? Math.max(...data.map((d) => d.totalCount)) : 0;
  const preview = data.slice(0, PREVIEW_COUNT);

  return (
    <>
      <div className="app-card rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-s font-semibold flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-muted-foreground" />
              Most Rejected
            </h2>
            {highReject > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {highReject} high
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {totalInternal > 0 && (
              <div className="flex items-center gap-xs">
                <Users className="w-3 h-3 text-orange" />
                <span className="text-muted-foreground">{totalInternal} internal</span>
              </div>
            )}
            {totalClient > 0 && (
              <div className="flex items-center gap-xs">
                <UserX className="w-3 h-3 text-destructive" />
                <span className="text-muted-foreground">{totalClient} client</span>
              </div>
            )}
            {data.length === 0 && (
              <span className="text-muted-foreground">No rejections</span>
            )}
          </div>
        </div>

        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ThumbsDown className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-s text-muted-foreground">No rejected tasks</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {preview.map((item) => (
              <CompactRow key={item.task.id} item={item} maxCount={maxCount} />
            ))}
          </div>
        )}

        {data.length > PREVIEW_COUNT && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 border-t border-border text-s font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-xs"
          >
            <ExternalLink className="w-3 h-3" />
            View All ({data.length})
          </button>
        )}
      </div>

      {showAll && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="flex app-top-bar items-center justify-between border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAll(false)} className="flex items-center gap-xs text-muted-foreground hover:text-foreground transition-colors text-s">
                <X className="w-4 h-4" />
                Close
              </button>
              <span className="text-border">|</span>
              <h2 className="text-s font-semibold flex items-center gap-2">
                <ThumbsDown className="w-4 h-4 text-muted-foreground" />
                Most Rejected Tasks
                <span className="text-xs font-normal text-muted-foreground">({data.length} tasks)</span>
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-4">
              <div className="app-card rounded-xl border border-border bg-card divide-y divide-border">
                <div className="grid grid-cols-[1fr_auto] @md/card:grid-cols-[1fr_100px_70px_70px_70px_100px] gap-3 px-5 py-2.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Task</span>
                  <span className="@max-md/card:hidden">Stage</span>
                  <span className="text-center @max-md/card:hidden">Internal</span>
                  <span className="text-center @max-md/card:hidden">Client</span>
                  <span className="text-center">Total</span>
                  <span className="text-end @max-md/card:hidden">Last</span>
                </div>
                {data.map((item) => (
                  <FullRow key={item.task.id} item={item} />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
