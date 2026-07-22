"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, Sparkles, Bug, AlertCircle, Palette, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpNextEntry {
  project: { id: string; name: string; logoUrl: string | null };
  task: {
    id: string;
    title: string;
    taskNumber: number;
    taskType: string;
    priority: number | null;
    assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  };
  moreReady: number;
}

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const fmtTaskNumber = (n: number) => `T-${String(n).padStart(3, "0")}`;

function priorityColor(priority: number | null) {
  if (priority == null) return "text-muted-foreground";
  if (priority >= 8) return "text-red-400";
  if (priority >= 5) return "text-amber-400";
  return "text-muted-foreground";
}

const PREVIEW_COUNT = 5;

function Row({ entry }: { entry: UpNextEntry }) {
  const typeInfo = TASK_TYPE_ICONS[entry.task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${entry.project.id}/tasks/${entry.task.id}`}
      target="_blank"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group"
    >
      {entry.project.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.project.logoUrl}
          alt=""
          className="w-6 h-6 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-6 h-6 rounded bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
          {entry.project.name[0]?.toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground truncate">
            {entry.project.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {entry.task.priority != null && (
              <span className={cn("text-[10px] font-bold tabular-nums", priorityColor(entry.task.priority))}>
                P{entry.task.priority}
              </span>
            )}
            <div className={cn("w-4 h-4 rounded flex items-center justify-center border", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
              <TypeIcon className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>
        <p className="text-[12px] font-medium truncate group-hover:text-primary transition-colors mt-0.5">
          {entry.task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          <span className="font-mono">{fmtTaskNumber(entry.task.taskNumber)}</span>
          <span>·</span>
          <span className="truncate">{entry.task.assignee?.name ?? "Unassigned"}</span>
          {entry.moreReady > 0 && (
            <>
              <span>·</span>
              <span className="text-cyan-400/80">+{entry.moreReady} more ready</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

// One row per active project: the top-priority Clarification task that is
// ready to be pulled into development — the board's "Up Next" slot, across
// every project at once.
export function UpNextByProject({ data }: { data: UpNextEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? data : data.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[14px] font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Up Next By Project
          </h2>
          {data.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5">
              {data.length} project{data.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">
            {data.length === 0
              ? "Nothing is ready to pull"
              : "Next task ready to start in each project"}
          </span>
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 min-h-[260px]">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Zap className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted-foreground">No tasks ready to start</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-56">
              A task shows here once its required questions are answered and a priority is set.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {visible.map((entry) => (
              <Row key={entry.project.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Expand / collapse */}
      {data.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5 mt-auto"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show All ({data.length})
            </>
          )}
        </button>
      )}
    </div>
  );
}
