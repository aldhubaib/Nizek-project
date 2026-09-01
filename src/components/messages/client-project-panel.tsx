"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getTypeIcon } from "@/components/project/sprint-task-row";
import { cn } from "@/lib/utils";
import {
  getClientProjectOverview,
  type ClientProjectOverview,
} from "@/actions/client-project";
import { listSprints, type SprintDTO } from "@/actions/sprint";
import { getTasksByProject } from "@/actions/task";
import { CompletedSprintsTab } from "@/components/project/completed-sprints-tab";
import { type KanbanTask } from "@/store/kanban";

type PanelTab = "dashboard" | "roadmap";

const overviewCache = new Map<string, ClientProjectOverview>();

function daysLeft(iso: string, nowMs: number): number {
  return Math.ceil((new Date(iso).getTime() - nowMs) / (1000 * 60 * 60 * 24));
}

function daysRemainingLabel(iso: string, nowMs: number): string {
  const d = daysLeft(iso, nowMs);
  if (d < 0) return `${Math.abs(d)} days overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Days remaining 1";
  return `Days remaining ${d}`;
}

function daysLeftColor(iso: string, nowMs: number): string {
  const d = daysLeft(iso, nowMs);
  if (d < 0) return "text-destructive";
  if (d <= 7) return "text-orange";
  return "text-success";
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-5", className)}>
      {children}
    </div>
  );
}

const SPRINT_STAGE_BARS = [
  { key: "TODO", label: "Todo" },
  { key: "IN_DEVELOPMENT", label: "In Development" },
  { key: "INTERNAL_REVIEW", label: "Internal Review" },
  { key: "DONE", label: "Done" },
] as const;

const TYPE_RING = [
  { key: "FEATURE", label: "Business cases", color: "#38bdf8" },
  { key: "ENHANCEMENT", label: "Enhancements", color: "#a78bfa" },
  { key: "BUG", label: "Bugs", color: "#ef4444" },
  { key: "REPORTED_BUG", label: "Reported bugs", color: "#ef4444" },
  { key: "DESIGN", label: "Design", color: "#22d3ee" },
] as const;

function SprintStageStack({
  byStage,
}: {
  byStage: Record<string, Record<string, number>>;
}) {
  const columns = SPRINT_STAGE_BARS.map((stage) => {
    const types = byStage[stage.key] ?? {};
    const total = Object.values(types).reduce((n, count) => n + count, 0);
    return { ...stage, types, total };
  });
  const max = Math.max(...columns.map((col) => col.total), 1);
  const usedTypes = TYPE_RING.filter((type) =>
    columns.some((col) => (col.types[type.key] ?? 0) > 0),
  );

  return (
    <div>
      <div className="flex items-end justify-around gap-2">
        {columns.map((col) => {
          const height = Math.max(28, Math.round((col.total / max) * 160));
          return (
            <div
              key={col.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div
                className="flex w-9 flex-col overflow-hidden rounded-full bg-border/60 sm:w-10"
                style={{ height }}
              >
                {col.total === 0 ? (
                  <div className="h-full w-full bg-border/30" />
                ) : (
                  TYPE_RING.map((type) => {
                    const count = col.types[type.key] ?? 0;
                    if (!count) return null;
                    return (
                      <div
                        key={type.key}
                        className="w-full"
                        style={{ flex: count, background: type.color }}
                        title={`${type.label}: ${count}`}
                      />
                    );
                  })
                )}
              </div>
              <span className="text-center text-xs leading-tight text-muted-foreground">
                {col.label}
              </span>
              <span className="text-xs tabular-nums text-foreground">{col.total}</span>
            </div>
          );
        })}
      </div>
      {usedTypes.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
          {usedTypes.map((type) => (
            <div key={type.key} className="flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: type.color }}
              />
              <span className="text-xs text-muted-foreground">{type.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The client's own view of their project, opened from the chat's 3-dot menu.
 * Everything here is read-only: clients have no project page to visit, so this
 * is where progress and the road map are visible to them.
 */
export function ClientProjectPanel({
  projectId,
  tab,
  onTabChange,
}: {
  projectId: string;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
}) {
  const [data, setData] = useState<ClientProjectOverview | null>(
    () => overviewCache.get(projectId) ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getClientProjectOverview(projectId)
      .then((row) => {
        overviewCache.set(projectId, row);
        if (!cancelled) setData(row);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your project.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (tab === "roadmap") {
    return (
      <div className="flex min-h-full w-full flex-col px-app py-4 lg:h-full lg:w-max lg:min-w-full">
        <ClientRoadmapBoard projectId={projectId} />
      </div>
    );
  }

  if (error) {
    return <p className="px-app py-6 text-s text-destructive">{error}</p>;
  }

  if (!data) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-app py-4">
        <DashboardTab data={data} />
      </div>
    </div>
  );
}

function ClientRoadmapBoard({ projectId }: { projectId: string }) {
  const [sprints, setSprints] = useState<SprintDTO[] | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSprints(projectId), getTasksByProject(projectId)])
      .then(([nextSprints, nextTasks]) => {
        if (cancelled) return;
        setSprints(nextSprints);
        setTasks(nextTasks as unknown as KanbanTask[]);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the road map.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return <p className="px-1 text-s text-destructive">{error}</p>;
  }

  if (!sprints || !tasks) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <CompletedSprintsTab
      projectId={projectId}
      sprints={sprints}
      onSprintsChange={(next) =>
        setSprints((prev) => (typeof next === "function" ? next(prev ?? []) : next))
      }
      initialTasks={tasks}
      canManage={false}
      canMoveTasks={false}
      canStartSprint={false}
      canEndSprint={false}
      canCreateSprintPlanning={false}
      isProjectActive={false}
      hideAssignees
      embedInScrollParent
    />
  );
}

function DashboardTab({
  data,
}: {
  data: ClientProjectOverview;
}) {
  const nowMs = Date.now();
  const typeGroups = TYPE_RING.map((slice) => {
    const tasks = data.typedTasks.filter((t) => t.taskType === slice.key);
    return {
      ...slice,
      tasks,
      done: tasks.filter((t) => t.stage === "DONE").length,
    };
  });

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {typeGroups.map((group) => {
          const { icon: Icon, color } = getTypeIcon(group.key);
          const remaining = Math.max(0, group.tasks.length - group.done);
          return (
            <div
              key={group.key}
              className="rounded-2xl border border-border/60 bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <Icon className={cn("size-4 shrink-0", color)} />
                <span className="truncate text-xs text-muted-foreground">
                  {group.label}
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
                {group.done}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {remaining === 1 ? "1 remaining" : `${remaining} remaining`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mb-6 space-y-4">
        <Card className="py-8">
          <div className="mb-6 flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-s font-semibold text-foreground">
              {data.activeSprint?.name ?? "Current sprint"}
            </h2>
            {data.activeSprint ? (
              <span
                className={cn(
                  "shrink-0 text-xs font-semibold tabular-nums",
                  daysLeftColor(data.activeSprint.endDate, nowMs),
                )}
              >
                {daysRemainingLabel(data.activeSprint.endDate, nowMs)}
              </span>
            ) : null}
          </div>
          {data.activeSprint ? (
            <div className="grid gap-3 py-4">
              {data.activeSprint.total > 0 ? (
                <SprintStageStack
                  byStage={data.activeSprint.stageTypeBreakdown ?? {}}
                />
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No tasks in this sprint.
                </p>
              )}
              {data.activeSprint.goal ? (
                <p className="text-s text-muted-foreground">{data.activeSprint.goal}</p>
              ) : null}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No sprint is running right now.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
