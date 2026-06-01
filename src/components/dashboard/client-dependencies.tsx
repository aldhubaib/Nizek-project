"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Clock, X, ExternalLink, Sparkles, Zap, Bug, AlertCircle, Palette, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientDepTask {
  task: {
    id: string;
    title: string;
    taskNumber: number;
    taskType: string;
    stage: string;
    priority: number | null;
    projectId: string;
    project: { id: string; name: string };
    assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  };
  note: string;
}

interface ProjectGroup {
  project: { id: string; name: string };
  tasks: ClientDepTask[];
}

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Feature" },
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

const PREVIEW_COUNT = 5;

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

function CompactRow({ item }: { item: ClientDepTask }) {
  const typeInfo = TASK_TYPE_ICONS[item.task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${item.task.project.id}?task=${item.task.id}`}
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
          {item.note && (
            <Tooltip text={item.note}>
              <StickyNote className="w-3 h-3 text-amber-400/60 shrink-0" />
            </Tooltip>
          )}
        </div>
      </div>
    </Link>
  );
}

function FullRow({ item }: { item: ClientDepTask }) {
  const typeInfo = TASK_TYPE_ICONS[item.task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${item.task.project.id}?task=${item.task.id}`}
      className="grid grid-cols-[1fr_100px_110px_1fr] gap-3 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
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

      <span className="text-[11px] text-muted-foreground truncate">
        {item.task.assignee?.name ?? "Unassigned"}
      </span>

      <p className="text-[11px] text-muted-foreground/60 truncate italic">
        {item.note || "—"}
      </p>
    </Link>
  );
}

export function ClientDependencies({ data }: { data: ProjectGroup[] }) {
  const [showAll, setShowAll] = useState(false);

  const totalTasks = data.reduce((s, g) => s + g.tasks.length, 0);
  const allTasks = data.flatMap((g) => g.tasks);
  const preview = allTasks.slice(0, PREVIEW_COUNT);

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[14px] font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Waiting on Client
            </h2>
            {totalTasks > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                {totalTasks} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            {data.slice(0, 4).map((g) => (
              <span key={g.project.id} className="text-muted-foreground">
                {g.project.name}: <span className="font-semibold text-foreground">{g.tasks.length}</span>
              </span>
            ))}
            {data.length > 4 && (
              <span className="text-muted-foreground/50">+{data.length - 4} more</span>
            )}
            {data.length === 0 && (
              <span className="text-muted-foreground">No pending items</span>
            )}
          </div>
        </div>

        {totalTasks === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted-foreground">Nothing waiting on client</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {preview.map((item) => (
              <CompactRow key={item.task.id} item={item} />
            ))}
          </div>
        )}

        {allTasks.length > PREVIEW_COUNT && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            View All ({totalTasks})
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
                <Clock className="w-4 h-4 text-muted-foreground" />
                Waiting on Client
                <span className="text-[11px] font-normal text-muted-foreground">({totalTasks} tasks across {data.length} projects)</span>
              </h2>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
              {totalTasks} pending
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-4 space-y-4">
              {data.map((group) => (
                <div key={group.project.id} className="rounded-xl border border-border bg-card divide-y divide-border">
                  <div className="px-5 py-3 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold">{group.project.name}</h3>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_100px_110px_1fr] gap-3 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    <span>Task</span>
                    <span>Stage</span>
                    <span>Assignee</span>
                    <span>Note</span>
                  </div>
                  {group.tasks.map((item) => (
                    <FullRow key={item.task.id} item={item} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
