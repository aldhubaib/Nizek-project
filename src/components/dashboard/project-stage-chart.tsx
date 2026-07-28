"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { BarChart3, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { getProjectStageDistribution } from "@/actions/dashboard";

type Distribution = NonNullable<Awaited<ReturnType<typeof getProjectStageDistribution>>>;
type ProjectEntry = Distribution["projects"][number];
type GroupKey = "clarification" | "development" | "review";

const GROUPS: { key: GroupKey; label: string; stages: string; bar: string; dot: string; text: string }[] = [
  {
    key: "clarification",
    label: "Clarification",
    stages: "Clarification",
    bar: "bg-violet-400",
    dot: "bg-violet-400",
    text: "text-violet-400",
  },
  {
    key: "development",
    label: "Development",
    stages: "Ready for Dev · In Development",
    bar: "bg-blue-400",
    dot: "bg-blue-400",
    text: "text-blue-400",
  },
  {
    key: "review",
    label: "Review",
    stages: "Internal Review · Client Review · Ready for Release",
    bar: "bg-amber-400",
    dot: "bg-amber-400",
    text: "text-amber-400",
  },
];

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function ProjectStageChart({
  data,
  audienceNote,
  className,
}: {
  data: Distribution;
  audienceNote?: string;
  className?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [selected, setSelected] = useState<{ project: ProjectEntry; group: GroupKey } | null>(null);

  return (
    <div className={cn("relative rounded-xl border border-border bg-card p-4", className ?? "mt-4")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-muted/60 border border-border flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold leading-tight">Tasks by stage</h2>
            <p className="text-[11px] text-muted-foreground">
              Where each project&apos;s open tasks are in the pipeline
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowInfo((v) => !v)}
          title="What is this?"
          className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
        >
          <Info className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Info popover */}
      {showInfo && (
        <div className="absolute right-3 top-12 z-20 w-80 rounded-lg border border-border bg-popover p-3 shadow-xl">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-semibold text-foreground">About this module</span>
            <button
              onClick={() => setShowInfo(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            One bar per project you&apos;re on, showing where its open tasks sit across three
            groups: <strong className="text-violet-400">Clarification</strong>,{" "}
            <strong className="text-blue-400">Development</strong> (Ready for Dev + In
            Development) and <strong className="text-amber-400">Review</strong> (Internal
            Review + Client Review + Ready for Release).
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Click any segment to open the project&apos;s breakdown with the tasks in that group.
          </p>
          <p className="mt-1.5 text-[10px] text-muted-foreground/60">
            {audienceNote ?? "Visible to Developers, PMs and Team Lead role holders."}
          </p>
        </div>
      )}

      {/* Bars */}
      {data.projects.length === 0 ? (
        <p className="py-10 text-center text-[12px] text-muted-foreground">
          No open tasks in the pipeline across your projects.
        </p>
      ) : (
        <div className="flex items-end gap-3 px-1">
          {data.projects.map((project) => (
            <div key={project.id} className="flex flex-col items-center gap-2 flex-1 min-w-0">
              <div className="h-40 w-full max-w-16 flex flex-col justify-end rounded-lg overflow-hidden bg-muted/20">
                {GROUPS.map(({ key, label, bar }) => {
                  const count = project.groups[key];
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelected({ project, group: key })}
                      title={`${label}: ${count}`}
                      className={cn(bar, "w-full min-h-[10px] hover:opacity-80 transition-opacity")}
                      style={{ height: `${(count / project.total) * 100}%` }}
                    />
                  );
                })}
              </div>
              <div className="relative group flex flex-col items-center gap-0.5">
                <span className="w-6 h-6 rounded-full bg-muted border border-border text-[10px] font-bold text-muted-foreground flex items-center justify-center">
                  {project.name.trim().slice(0, 1).toUpperCase()}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{project.total}</span>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] font-medium text-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  {project.name.trim()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60">
        {GROUPS.map(({ key, label, dot }) => (
          <span key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={cn("w-2 h-2 rounded-sm", dot)} />
            {label}
          </span>
        ))}
      </div>

      {/* Details popup */}
      {selected && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-[16px] font-semibold flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-muted border border-border text-[11px] font-bold text-muted-foreground flex items-center justify-center">
                  {selected.project.name.trim().slice(0, 1).toUpperCase()}
                </span>
                {selected.project.name}
                <span className="text-[12px] font-medium text-muted-foreground">
                  {selected.project.total} task{selected.project.total === 1 ? "" : "s"}
                </span>
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Group breakdown */}
            <div className="px-6 space-y-2">
              {GROUPS.map(({ key, label, stages, bar, dot }) => {
                const count = selected.project.groups[key];
                const pct = selected.project.total > 0 ? Math.round((count / selected.project.total) * 100) : 0;
                const active = selected.group === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected({ project: selected.project, group: key })}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                      active ? "border-primary/40 bg-primary/[0.04]" : "border-border hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-sm shrink-0", dot)} />
                      <span className="text-[13px] font-medium">{label}</span>
                      <span className="text-[10px] text-muted-foreground/60 truncate">{stages}</span>
                      <span className="ml-auto text-[14px] font-bold tabular-nums">{count}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">{pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tasks of the selected group */}
            <div className="px-6 pt-4 pb-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                {GROUPS.find((g) => g.key === selected.group)?.label} tasks
              </p>
              <div className="space-y-1.5">
                {selected.project.tasks.filter((t) => t.group === selected.group).length === 0 && (
                  <p className="py-4 text-center text-[12px] text-muted-foreground">
                    No tasks in this group.
                  </p>
                )}
                {selected.project.tasks
                  .filter((t) => t.group === selected.group)
                  .map((task) => (
                    <Link
                      key={task.id}
                      href={`/dashboard/projects/${selected.project.id}/tasks/${task.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{task.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          #{task.taskNumber} · {task.stageLabel}
                        </p>
                      </div>
                      {task.assignee && (
                        task.assignee.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={task.assignee.imageUrl}
                            alt={task.assignee.name ?? ""}
                            title={task.assignee.name ?? undefined}
                            className="w-6 h-6 rounded-full shrink-0 object-cover"
                          />
                        ) : (
                          <span
                            title={task.assignee.name ?? undefined}
                            className="w-6 h-6 rounded-full shrink-0 bg-blue-500/20 text-blue-300 text-[9px] font-bold flex items-center justify-center"
                          >
                            {initials(task.assignee.name)}
                          </span>
                        )
                      )}
                    </Link>
                  ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
