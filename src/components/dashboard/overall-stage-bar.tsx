"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { BarChart3, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { getProjectStageDistribution } from "@/actions/dashboard";

type Distribution = NonNullable<Awaited<ReturnType<typeof getProjectStageDistribution>>>;
type GroupKey = "clarification" | "development" | "review";

const GROUPS: { key: GroupKey; label: string; bar: string; dot: string }[] = [
  { key: "clarification", label: "Clarification", bar: "bg-violet-400", dot: "bg-violet-400" },
  { key: "development", label: "Development", bar: "bg-primary", dot: "bg-primary" },
  { key: "review", label: "Review", bar: "bg-orange", dot: "bg-orange" },
];

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function OverallStageBar({
  data,
  audienceNote,
  className,
}: {
  data: Distribution;
  audienceNote?: string;
  className?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupKey | null>(null);

  const { totals, total, tasksByGroup } = useMemo(() => {
    const totals: Record<GroupKey, number> = { clarification: 0, development: 0, review: 0 };
    const tasksByGroup: Record<GroupKey, {
      id: string;
      title: string;
      taskNumber: number;
      stageLabel: string;
      projectId: string;
      projectName: string;
      assignee: { id: string; name: string | null; imageUrl: string | null } | null;
    }[]> = { clarification: [], development: [], review: [] };

    for (const project of data.projects) {
      for (const key of Object.keys(totals) as GroupKey[]) {
        totals[key] += project.groups[key];
      }
      for (const task of project.tasks) {
        tasksByGroup[task.group].push({
          id: task.id,
          title: task.title,
          taskNumber: task.taskNumber,
          stageLabel: task.stageLabel,
          projectId: project.id,
          projectName: project.name,
          assignee: task.assignee,
        });
      }
    }
    return { totals, total: totals.clarification + totals.development + totals.review, tasksByGroup };
  }, [data]);

  return (
    <div className={cn("app-card relative rounded-xl border border-border bg-card p-4", className ?? "mt-4")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-s">
          <span className="w-8 h-8 rounded-lg bg-muted/60 border border-border flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-muted-foreground rotate-90" strokeWidth={1.5} />
          </span>
          <div>
            <h2 className="text-s font-semibold leading-tight">Overall pipeline</h2>
            <p className="text-xs text-muted-foreground">
              All open tasks across your projects combined
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
            <span className="text-xs font-semibold text-foreground">About this module</span>
            <button
              onClick={() => setShowInfo(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            One bar combining every open task across all your projects:{" "}
            <strong className="text-violet-400">Clarification</strong>,{" "}
            <strong className="text-primary">Development</strong> (In
            Development) and <strong className="text-orange">Review</strong> (Internal
            Review + Client Review). The number on each segment is its
            task count.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Click a segment to list its tasks across all projects.
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground/60">
            {audienceNote ?? "Visible to Developers, PMs and Team Lead role holders."}
          </p>
        </div>
      )}

      {/* Bar */}
      {total === 0 ? (
        <p className="py-6 text-center text-s text-muted-foreground">
          No open tasks in the pipeline across your projects.
        </p>
      ) : (
        <div className="flex h-10 w-full rounded-lg overflow-hidden bg-muted/20">
          {GROUPS.map(({ key, label, bar }) => {
            const count = totals[key];
            if (count === 0) return null;
            const pct = (count / total) * 100;
            return (
              <button
                key={key}
                onClick={() => setSelectedGroup(key)}
                title={`${label}: ${count}`}
                style={{ width: `${pct}%` }}
                className={cn(
                  bar,
                  "h-full min-w-[28px] flex items-center justify-center hover:opacity-80 transition-opacity",
                )}
              >
                <span className="text-s font-bold text-background tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60">
        {GROUPS.map(({ key, label, dot }) => (
          <span key={key} className="flex items-center gap-xs text-xs text-muted-foreground">
            <span className={cn("w-2 h-2 rounded-sm", dot)} />
            {label}
          </span>
        ))}
        <span className="ms-auto text-xs text-muted-foreground tabular-nums">
          {total} task{total === 1 ? "" : "s"} total
        </span>
      </div>

      {/* Group tasks popup */}
      {selectedGroup && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-10 px-4"
          onClick={() => setSelectedGroup(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-m font-semibold flex items-center gap-2">
                <span className={cn("w-2.5 h-2.5 rounded-sm", GROUPS.find((g) => g.key === selectedGroup)?.dot)} />
                {GROUPS.find((g) => g.key === selectedGroup)?.label}
                <span className="text-s font-medium text-muted-foreground">
                  {totals[selectedGroup]} task{totals[selectedGroup] === 1 ? "" : "s"} across all projects
                </span>
              </h2>
              <button
                onClick={() => setSelectedGroup(null)}
                className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-1.5">
              {tasksByGroup[selectedGroup].length === 0 && (
                <p className="py-4 text-center text-s text-muted-foreground">
                  No tasks in this group.
                </p>
              )}
              {tasksByGroup[selectedGroup].map((task) => (
                <Link
                  key={task.id}
                  href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 transition-colors hover:bg-accent/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-s font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {task.projectName} · #{task.taskNumber} · {task.stageLabel}
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
                        className="w-6 h-6 rounded-full shrink-0 bg-primary/20 text-primary text-xs font-bold flex items-center justify-center"
                      >
                        {initials(task.assignee.name)}
                      </span>
                    )
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
