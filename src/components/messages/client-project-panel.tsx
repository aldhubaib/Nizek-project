"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { getTypeIcon, SprintTaskRow } from "@/components/project/sprint-task-row";
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

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const RING_C = 88;

function daysLeft(iso: string, nowMs: number): number {
  return Math.ceil((new Date(iso).getTime() - nowMs) / (1000 * 60 * 60 * 24));
}

function daysLeftLabel(iso: string, nowMs: number): string {
  const d = daysLeft(iso, nowMs);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Tomorrow";
  return `${d}d`;
}

function daysLeftColor(iso: string, nowMs: number): string {
  const d = daysLeft(iso, nowMs);
  if (d < 0) return "text-destructive";
  if (d <= 7) return "text-orange";
  return "text-success";
}

function sprintProgress(startIso: string, endIso: string, nowMs: number): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (nowMs <= start) return 0;
  if (nowMs >= end) return 100;
  return Math.round(((nowMs - start) / (end - start)) * 100);
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-5", className)}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-s font-semibold text-foreground">{children}</h2>;
}

/** Client-facing slices — internal review is folded into Review, not named as such. */
const STAGE_RING = [
  { key: "READY_FOR_DEV", label: "Todo", color: "#22d3ee" },
  { key: "IN_DEVELOPMENT", label: "In Dev", color: "#38bdf8" },
  { key: "INTERNAL_REVIEW", label: "Review", color: "#f97316" },
  { key: "CLIENT_REVIEW", label: "Waiting on you", color: "#fb923c" },
  { key: "READY_FOR_RELEASE", label: "Ready", color: "#34d399" },
  { key: "DONE", label: "Delivered", color: "#4ade80" },
] as const;

const TYPE_RING = [
  { key: "FEATURE", label: "Business cases", color: "#38bdf8" },
  { key: "ENHANCEMENT", label: "Enhancements", color: "#a78bfa" },
  { key: "BUG", label: "Bugs", color: "#ef4444" },
  { key: "REPORTED_BUG", label: "Reported bugs", color: "#ef4444" },
  { key: "DESIGN", label: "Design", color: "#22d3ee" },
] as const;

function DonutChart({
  breakdown,
  total,
  slices,
}: {
  breakdown: Record<string, number>;
  total: number;
  slices: readonly { key: string; label: string; color: string }[];
}) {
  const R = 40;
  const STROKE = 10;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const counts = slices.map((slice) => ({
    ...slice,
    count: breakdown[slice.key] ?? 0,
  }));
  const visible = counts.filter((s) => s.count > 0);
  const arcs = visible.map((slice) => {
    const dash = (slice.count / total) * C;
    const arc = { ...slice, dash, gap: C - dash, offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width={100} height={100} viewBox="0 0 100 100" className="-rotate-90">
          <circle
            cx={50}
            cy={50}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-border"
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">tasks</span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((slice) => (
          <div key={slice.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="text-xs text-muted-foreground">{slice.label}</span>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {slice.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeStackBars({
  groups,
}: {
  groups: {
    key: string;
    label: string;
    color: string;
    done: number;
    tasks: { id: string }[];
  }[];
}) {
  const maxTotal = Math.max(...groups.map((g) => g.tasks.length), 1);
  const maxH = 140;

  return (
    <Card>
      <CardTitle>By type</CardTitle>
      <div className="flex items-end justify-around gap-3 px-2">
        {groups.map((group) => {
          const total = group.tasks.length;
          const remaining = Math.max(0, total - group.done);
          const height = Math.max(28, Math.round((total / maxTotal) * maxH));
          const { icon: Icon, color } = getTypeIcon(group.key);
          return (
            <div
              key={group.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              title={`${group.label}: ${group.done} completed of ${total}`}
            >
              <div
                className="flex w-10 flex-col overflow-hidden rounded-full bg-border/60"
                style={{ height }}
              >
                {remaining > 0 && (
                  <div
                    className="w-full"
                    style={{ flex: remaining, background: group.color, opacity: 0.35 }}
                  />
                )}
                {group.done > 0 && (
                  <div
                    className="w-full"
                    style={{ flex: group.done, background: group.color }}
                  />
                )}
              </div>
              <Icon className={cn("size-4 shrink-0", color)} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {total}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Solid is completed · faded is remaining
      </p>
    </Card>
  );
}

function SprintRingCard({
  name,
  startDate,
  endDate,
  taskCount,
  nowMs,
}: {
  name: string;
  startDate: string;
  endDate: string;
  taskCount: number;
  nowMs: number;
}) {
  const pct = sprintProgress(startDate, endDate, nowMs);
  const left = daysLeft(endDate, nowMs);
  const urgent = left <= 2;
  const dash = ((pct / 100) * RING_C).toFixed(2);
  const gap = (RING_C - (pct / 100) * RING_C).toFixed(2);

  return (
    <div className="flex w-full min-w-0 flex-col justify-between rounded-xl border border-border/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-s font-semibold text-foreground">{name}</span>
        <span className={cn("shrink-0 text-xs font-semibold tabular-nums", daysLeftColor(endDate, nowMs))}>
          {daysLeftLabel(endDate, nowMs)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <svg width={36} height={36} viewBox="0 0 36 36" className="-rotate-90 shrink-0">
          <circle cx={18} cy={18} r={14} fill="none" stroke="currentColor" strokeWidth={3} className="text-border" />
          <circle
            cx={18}
            cy={18}
            r={14}
            fill="none"
            stroke={urgent ? "#f97316" : "#22c55e"}
            strokeWidth={3}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{taskCount}</span> tasks
        </div>
      </div>
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
  const [data, setData] = useState<ClientProjectOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getClientProjectOverview(projectId)
      .then((row) => {
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
      <div className="flex h-full min-h-full w-max min-w-full flex-col px-app py-4">
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
        <DashboardTab data={data} onOpenTab={onTabChange} />
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
      onSprintsChange={setSprints}
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
  onOpenTab,
}: {
  data: ClientProjectOverview;
  onOpenTab: (tab: PanelTab) => void;
}) {
  const nowMs = Date.now();
  const donutTotal = STAGE_RING.reduce(
    (n, slice) => n + (data.stageBreakdown[slice.key] ?? 0),
    0,
  );
  const typeGroups = TYPE_RING.map((slice) => {
    const tasks = data.typedTasks.filter((t) => t.taskType === slice.key);
    return {
      ...slice,
      tasks,
      done: tasks.filter((t) => t.stage === "DONE").length,
    };
  }).filter((g) => g.tasks.length > 0);
  const openTypeGroups = TYPE_RING.map((slice) => ({
    ...slice,
    tasks: data.backlog.filter((t) => t.taskType === slice.key),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div>
      {typeGroups.length > 0 && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {typeGroups.map((group) => {
              const { icon: Icon, color } = getTypeIcon(group.key);
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
                    completed
                    {group.tasks.length > 0 ? ` of ${group.tasks.length}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mb-6">
            <TypeStackBars groups={typeGroups} />
          </div>
        </>
      )}

      <div className="mb-6 space-y-4">
        <Card>
          <CardTitle>Task Breakdown</CardTitle>
          {donutTotal > 0 ? (
            <DonutChart
              breakdown={data.stageBreakdown}
              total={donutTotal}
              slices={STAGE_RING}
            />
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No tasks yet
            </p>
          )}
        </Card>

        <Card>
          <CardTitle>Current sprint</CardTitle>
          {data.activeSprint || data.nextSprint ? (
            <div className="grid gap-3">
              {data.activeSprint && (
                <SprintRingCard
                  name={data.activeSprint.name}
                  startDate={data.activeSprint.startDate}
                  endDate={data.activeSprint.endDate}
                  taskCount={data.activeSprint.total}
                  nowMs={nowMs}
                />
              )}
              {data.nextSprint && (
                <SprintRingCard
                  name={data.nextSprint.name}
                  startDate={data.nextSprint.startDate}
                  endDate={data.nextSprint.endDate}
                  taskCount={data.nextSprint.taskCount}
                  nowMs={nowMs}
                />
              )}
              {data.activeSprint?.goal && (
                <p className="text-s text-muted-foreground">{data.activeSprint.goal}</p>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No sprint is running right now.
            </p>
          )}
        </Card>
      </div>

      {openTypeGroups.length === 0 ? (
        <div className="mb-6">
          <Card>
            <CardTitle>Tasks by type</CardTitle>
            <p className="py-6 text-center text-xs text-muted-foreground">
              No open tasks outside a sprint
            </p>
          </Card>
        </div>
      ) : (
        <div className="mb-6 space-y-4">
          {openTypeGroups.map((group) => {
            const { icon: Icon, color } = getTypeIcon(group.key);
            return (
              <Card key={group.key}>
                <div className="mb-4 flex items-center gap-2">
                  <Icon className={cn("size-4 shrink-0", color)} />
                  <h2 className="text-s font-semibold text-foreground">
                    {group.label}
                  </h2>
                </div>
                <div className="space-y-2">
                  {group.tasks.map((task) => (
                    <SprintTaskRow
                      key={task.id}
                      as="div"
                      hideAssignee
                      disableHoverBorder
                      task={{
                        title: task.title,
                        taskType: task.taskType,
                        stage: "BACKLOG",
                      }}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-s font-semibold text-foreground">
              {data.activeSprint ? "Sprint tasks" : "In progress"}
            </h2>
            {data.activeSprint && (
              <button
                type="button"
                onClick={() => onOpenTab("roadmap")}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Documents
              </button>
            )}
          </div>
          {data.sprintTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="mb-2 size-8 text-success/40" />
              <p className="text-s font-medium text-muted-foreground">
                Nothing in progress right now
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.sprintTasks.map((task) => (
                <SprintTaskRow
                  key={task.id}
                  as="div"
                  hideAssignee
                  disableHoverBorder
                  task={task}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          {data.deadlines.length > 0 && (
            <Card>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <div className="space-y-1">
                {data.deadlines.map((dl) => (
                  <div
                    key={dl.id}
                    className="flex items-center gap-3 rounded-xl px-2 py-2"
                  >
                    <CalendarClock className="size-4 shrink-0 text-orange" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-s text-foreground">{dl.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDay(dl.dueDate)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        daysLeftColor(dl.dueDate, nowMs),
                      )}
                    >
                      {daysLeftLabel(dl.dueDate, nowMs)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-s font-semibold text-foreground">Backlog</h2>
              <button
                type="button"
                onClick={() => onOpenTab("roadmap")}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                All
              </button>
            </div>
            {data.backlog.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nothing waiting in the backlog.
              </p>
            ) : (
              <div className="space-y-2">
                {data.backlog.slice(0, 5).map((task) => (
                  <SprintTaskRow
                    key={task.id}
                    as="div"
                    hideAssignee
                    disableHoverBorder
                    task={{
                      title: task.title,
                      taskType: task.taskType,
                      stage: "BACKLOG",
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
