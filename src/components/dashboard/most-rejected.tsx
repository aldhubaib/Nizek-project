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
  FEATURE: { icon: Sparkles, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const STAGE_LABELS: Record<string, string> = {
  NEW_REQUEST: "New Request",
  CLARIFICATION: "Clarification",
  READY_FOR_DEV: "Ready for Dev",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  READY_FOR_RELEASE: "Ready for Release",
  DONE: "Done",
};

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-popover border border-border text-[10px] text-popover-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
      </div>
    </div>
  );
}

function getCountColor(count: number) {
  if (count >= 5) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (count >= 3) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
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
      href={`/dashboard/projects/${item.task.project.id}?task=${item.task.id}`}
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
            <p className="text-[12px] font-medium truncate group-hover:text-primary transition-colors">
              <span className="text-muted-foreground/50 font-mono mr-1">#{item.task.taskNumber}</span>
              {item.task.title}
            </p>
            <p className="text-[10px] text-muted-foreground/50 truncate">{item.task.project.name}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.internalCount > 0 && (
              <Tooltip text={`${item.internalCount} internal rejection${item.internalCount !== 1 ? "s" : ""}`}>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400">
                  <Users className="w-3 h-3" />
                  {item.internalCount}
                </span>
              </Tooltip>
            )}
            {item.clientCount > 0 && (
              <Tooltip text={`${item.clientCount} client rejection${item.clientCount !== 1 ? "s" : ""}`}>
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400">
                  <UserX className="w-3 h-3" />
                  {item.clientCount}
                </span>
              </Tooltip>
            )}
            <span className={cn("text-[11px] font-bold tabular-nums rounded-full px-1.5 py-0 border", getCountColor(item.totalCount))}>
              {item.totalCount}
            </span>
          </div>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${barW}%` }} />
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
      href={`/dashboard/projects/${item.task.project.id}?task=${item.task.id}`}
      target="_blank"
      className="grid grid-cols-[1fr_100px_70px_70px_70px_100px] gap-3 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Tooltip text={typeInfo?.label ?? item.task.taskType}>
          <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
        </Tooltip>
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">{item.task.title}</p>
          <p className="text-[10px] text-muted-foreground/50">
            <span className="font-mono">#{item.task.taskNumber}</span>
            <span className="mx-1">·</span>
            {item.task.project.name}
          </p>
        </div>
      </div>

      <span className="text-[11px] text-muted-foreground truncate">{STAGE_LABELS[item.task.stage] ?? item.task.stage}</span>

      <div className="flex justify-center">
        <span className="flex items-center gap-0.5 text-[12px] font-bold text-amber-400">
          <Users className="w-3 h-3" />
          {item.internalCount}
        </span>
      </div>

      <div className="flex justify-center">
        <span className="flex items-center gap-0.5 text-[12px] font-bold text-red-400">
          <UserX className="w-3 h-3" />
          {item.clientCount}
        </span>
      </div>

      <div className="flex justify-center">
        <span className={cn("text-[12px] font-bold tabular-nums rounded-full px-2 py-0.5 border", getCountColor(item.totalCount))}>
          {item.totalCount}
        </span>
      </div>

      <div className="text-right">
        <span className="text-[11px] text-muted-foreground">
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
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[14px] font-semibold flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-muted-foreground" />
              Most Rejected
            </h2>
            {highReject > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                {highReject} high
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            {totalInternal > 0 && (
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-amber-400" />
                <span className="text-muted-foreground">{totalInternal} internal</span>
              </div>
            )}
            {totalClient > 0 && (
              <div className="flex items-center gap-1.5">
                <UserX className="w-3 h-3 text-red-400" />
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
            <p className="text-[12px] text-muted-foreground">No rejected tasks</p>
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
            className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            View All ({data.length})
          </button>
        )}
      </div>

      {showAll && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAll(false)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]">
                <X className="w-4 h-4" />
                Close
              </button>
              <span className="text-border">|</span>
              <h2 className="text-[13px] font-semibold flex items-center gap-2">
                <ThumbsDown className="w-4 h-4 text-muted-foreground" />
                Most Rejected Tasks
                <span className="text-[11px] font-normal text-muted-foreground">({data.length} tasks)</span>
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-4">
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                <div className="grid grid-cols-[1fr_100px_70px_70px_70px_100px] gap-3 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Task</span>
                  <span>Stage</span>
                  <span className="text-center">Internal</span>
                  <span className="text-center">Client</span>
                  <span className="text-center">Total</span>
                  <span className="text-right">Last</span>
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
