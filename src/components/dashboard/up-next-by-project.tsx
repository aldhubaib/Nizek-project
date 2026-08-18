"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Zap, Sparkles, Bug, AlertCircle, Palette, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpNextEntry {
  project: { id: string; name: string; logoUrl: string | null };
  /** The project's single Up Next task — same slot as the board. */
  task: {
    id: string;
    title: string;
    taskNumber: number;
    taskType: string;
    priority: number | null;
    assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  };
}

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary bg-primary/10 border-primary/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const fmtTaskNumber = (n: number) => `T-${String(n).padStart(3, "0")}`;

function priorityColor(priority: number | null) {
  if (priority == null) return "text-muted-foreground";
  if (priority >= 8) return "text-destructive";
  if (priority >= 5) return "text-orange";
  return "text-muted-foreground";
}

function ProjectAvatar({ project, size = "w-6 h-6" }: { project: UpNextEntry["project"]; size?: string }) {
  return project.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={project.logoUrl} alt="" className={cn(size, "rounded object-cover shrink-0")} />
  ) : (
    <div className={cn(size, "rounded bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary shrink-0")}>
      {project.name[0]?.toUpperCase()}
    </div>
  );
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
      <ProjectAvatar project={entry.project} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground truncate">
            {entry.project.name}
          </span>
          <div className="flex items-center gap-xs shrink-0">
            {entry.task.priority != null && (
              <span className={cn("text-xs font-bold tabular-nums", priorityColor(entry.task.priority))}>
                P{entry.task.priority}
              </span>
            )}
            <div className={cn("w-4 h-4 rounded flex items-center justify-center border", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
              <TypeIcon className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>
        <p className="text-s font-medium truncate group-hover:text-primary transition-colors mt-0.5">
          {entry.task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{fmtTaskNumber(entry.task.taskNumber)}</span>
          <span>·</span>
          <span className="truncate">{entry.task.assignee?.name ?? "Unassigned"}</span>
        </div>
      </div>
    </Link>
  );
}

function FullRow({ entry }: { entry: UpNextEntry }) {
  const typeInfo = TASK_TYPE_ICONS[entry.task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${entry.project.id}/tasks/${entry.task.id}`}
      target="_blank"
      className="grid grid-cols-[minmax(0,7rem)_1fr_auto] @md/card:grid-cols-[150px_24px_1fr_120px_50px] gap-3 px-5 py-3 items-center hover:bg-accent/30 transition-colors group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <ProjectAvatar project={entry.project} />
        <span className="text-s font-semibold truncate">{entry.project.name}</span>
      </div>
      <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0 @max-md/card:hidden", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
        <TypeIcon className="w-3.5 h-3.5" />
      </div>
      <p className="text-s font-medium truncate group-hover:text-primary transition-colors min-w-0">
        <span className="text-muted-foreground/50 font-mono me-1.5 text-xs">{fmtTaskNumber(entry.task.taskNumber)}</span>
        {entry.task.title}
      </p>
      <span className="text-xs text-muted-foreground truncate @max-md/card:hidden">
        {entry.task.assignee?.name ?? "Unassigned"}
      </span>
      <span className={cn("text-s font-bold tabular-nums text-end", priorityColor(entry.task.priority))}>
        {entry.task.priority != null ? `P${entry.task.priority}` : "—"}
      </span>
    </Link>
  );
}

// One row per active project: the project's single Up Next task — the same
// task the board surfaces in the cyan Up Next slot. View All opens a
// fullscreen popup listing every project's Up Next.
export function UpNextByProject({ data }: { data: UpNextEntry[] }) {
  const [showAll, setShowAll] = useState(false);

  const preview = data.slice(0, PREVIEW_COUNT);

  return (
    <>
      <div className="app-card rounded-xl border border-border bg-card overflow-hidden flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-s font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Up Next By Project
            </h2>
            {data.length > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5">
                {data.length} project{data.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {data.length === 0
                ? "Nothing is ready to pull"
                : "The Up Next task in each project"}
            </span>
          </div>
        </div>

        {/* Rows */}
        <div className="flex-1 min-h-[260px]">
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Zap className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
              <p className="text-s text-muted-foreground">No tasks ready to start</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-56">
                A task shows here once its required questions are answered and a priority is set.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {preview.map((entry) => (
                <Row key={entry.project.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

        {/* View All */}
        {data.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 border-t border-border text-s font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-xs mt-auto"
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
              <button
                onClick={() => setShowAll(false)}
                className="flex items-center gap-xs text-muted-foreground hover:text-foreground transition-colors text-s"
              >
                <X className="w-4 h-4" />
                Close
              </button>
              <span className="text-border">|</span>
              <h2 className="text-s font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                Up Next By Project
                <span className="text-xs font-normal text-muted-foreground">
                  ({data.length} project{data.length !== 1 ? "s" : ""})
                </span>
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-4">
              <div className="app-card rounded-xl border border-border bg-card divide-y divide-border">
                <div className="grid grid-cols-[minmax(0,7rem)_1fr_auto] @md/card:grid-cols-[150px_24px_1fr_120px_50px] gap-3 px-5 py-2.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  <span>Project</span>
                  <span className="@max-md/card:hidden" />
                  <span>Up Next Task</span>
                  <span className="@max-md/card:hidden">Assignee</span>
                  <span className="text-end">Prio</span>
                </div>
                {data.map((entry) => (
                  <FullRow key={entry.project.id} entry={entry} />
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
