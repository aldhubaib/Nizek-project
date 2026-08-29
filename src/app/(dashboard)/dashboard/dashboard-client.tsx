"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  FolderKanban,
  Inbox,
  CalendarClock,
  ArrowRight,
  Flame,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { taskCode, TASK_STAGE_DOT, taskStageBadge } from "@/lib/task-label";
import { TaskTypeBadge, formatMinutes } from "@/components/project/sprint-task-row";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface MyTask {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
  estimatedMinutes: number | null;
  updatedAt: string;
  projectId: string;
  projectName: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  logoUrl: string | null;
  openTasks: number;
  activeSprint: {
    name: string;
    endDate: string;
    taskCount: number;
  } | null;
}

interface ActiveSprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  projectName: string;
  projectId: string;
  taskCount: number;
}

interface Deadline {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
}

interface Props {
  userName: string;
  unreadCount: number;
  myTasks: MyTask[];
  stageBreakdown: Record<string, number>;
  projects: ProjectSummary[];
  activeSprints: ActiveSprint[];
  upcomingDeadlines: Deadline[];
  /** Server render time — keeps day/progress math identical on hydrate. */
  nowIso: string;
}

/* ── helpers ── */

function daysLeft(iso: string, nowMs: number): number {
  const diff = new Date(iso).getTime() - nowMs;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
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
  if (d <= 2) return "text-orange";
  if (d <= 7) return "text-orange";
  return "text-success";
}

const RING_C = 88;

function sprintProgress(startIso: string, endIso: string, nowMs: number): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (nowMs <= start) return 0;
  if (nowMs >= end) return 100;
  return Math.round(((nowMs - start) / (end - start)) * 100);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ── card ── */

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

/* ── donut chart (pure SVG) ── */

const STAGE_RING = [
  { key: "READY_FOR_DEV", label: "Todo", color: "#22d3ee" },
  { key: "IN_DEVELOPMENT", label: "In Dev", color: "#38bdf8" },
  { key: "INTERNAL_REVIEW", label: "Review", color: "#f97316" },
  { key: "CLIENT_REVIEW", label: "Client", color: "#fb923c" },
] as const;

function DonutChart({
  breakdown,
  total,
}: {
  breakdown: Record<string, number>;
  total: number;
}) {
  if (total === 0) return null;
  const R = 40;
  const STROKE = 10;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const arcs = STAGE_RING.map(({ key, color }) => {
    const count = breakdown[key] ?? 0;
    const pct = count / total;
    const dash = pct * C;
    const arc = { key, color, dash, gap: C - dash, offset, count };
    offset += dash;
    return arc;
  }).filter((a) => a.count > 0);

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width={100} height={100} viewBox="0 0 100 100" className="-rotate-90">
          <circle
            cx={50} cy={50} r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-border"
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={50} cy={50} r={R}
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
        {STAGE_RING.map(({ key, label, color }) => {
          const count = breakdown[key] ?? 0;
          if (count === 0) return null;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-semibold tabular-nums text-foreground">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── sprint mini cards (horizontal) ── */

function SprintMiniCard({ sprint, nowMs }: { sprint: ActiveSprint; nowMs: number }) {
  const pct = sprintProgress(sprint.startDate, sprint.endDate, nowMs);
  const left = daysLeft(sprint.endDate, nowMs);
  const urgent = left <= 2;
  const dash = ((pct / 100) * RING_C).toFixed(2);
  const gap = (RING_C - (pct / 100) * RING_C).toFixed(2);

  return (
    <Link
      href={`/dashboard/projects/${sprint.projectId}?tab=sprints`}
      className="group flex min-w-0 flex-col justify-between rounded-xl border border-border/40 p-3 transition-colors hover:border-border"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-s font-semibold text-foreground">
          {sprint.projectName}
        </span>
        <span className={cn("shrink-0 text-xs font-semibold tabular-nums", daysLeftColor(sprint.endDate, nowMs))}>
          {daysLeftLabel(sprint.endDate, nowMs)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* ring */}
        <svg width={36} height={36} viewBox="0 0 36 36" className="-rotate-90 shrink-0">
          <circle cx={18} cy={18} r={14} fill="none" stroke="currentColor" strokeWidth={3} className="text-border" />
          <circle
            cx={18} cy={18} r={14} fill="none"
            stroke={urgent ? "#f97316" : "#22c55e"}
            strokeWidth={3}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{sprint.taskCount}</span> tasks
        </div>
      </div>
    </Link>
  );
}

/* ── project row with bar ── */

function ProjectRow({ project }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/60"
    >
      {project.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.logoUrl} alt="" className="size-7 shrink-0 rounded-md object-cover" />
      ) : (
        <Avatar size="sm">
          <AvatarFallback>{project.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-s font-medium text-foreground">{project.name}</p>
        <p className="text-xs text-muted-foreground">
          {project.activeSprint
            ? `${project.activeSprint.taskCount} sprint tasks`
            : `${project.openTasks} open`}
        </p>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/30" />
    </Link>
  );
}

/* ── main ── */

export function DashboardClient({
  userName,
  unreadCount,
  myTasks,
  stageBreakdown,
  projects,
  activeSprints,
  upcomingDeadlines,
  nowIso,
}: Props) {
  const nowMs = new Date(nowIso).getTime();
  const [greeting, setGreeting] = useState("Hello");
  useEffect(() => {
    setGreeting(getGreeting());
  }, []);
  const totalTasks = myTasks.length;
  const inDev = stageBreakdown["IN_DEVELOPMENT"] ?? 0;
  const inReview = (stageBreakdown["INTERNAL_REVIEW"] ?? 0) + (stageBreakdown["CLIENT_REVIEW"] ?? 0);

  return (
    <div className="px-app py-6 pb-16">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-m font-bold text-foreground">
          {greeting}, {userName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-s text-muted-foreground">
          Here&rsquo;s what needs your attention today.
        </p>
      </div>

      {/* Top stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="My tasks" value={totalTasks} icon={CheckCircle2} color="text-primary" bg="bg-primary/15" />
        <StatCard label="In development" value={inDev} icon={Flame} color="text-sky-400" bg="bg-sky-400/15" />
        <StatCard label="In review" value={inReview} icon={Clock} color="text-orange" bg="bg-orange/15" />
        <Link href="/dashboard/messages">
          <StatCard label="Unread messages" value={unreadCount} icon={Inbox} color="text-purple" bg="bg-purple/15" pulse={unreadCount > 0} />
        </Link>
      </div>

      {/* Row: Donut + Active Sprints (side by side) */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr]">
        {/* Donut breakdown */}
        <Card>
          <CardTitle>Task Breakdown</CardTitle>
          {totalTasks > 0 ? (
            <DonutChart breakdown={stageBreakdown} total={totalTasks} />
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">No active tasks</p>
          )}
        </Card>

        {/* Active Sprints — 2-col grid of mini cards */}
        <Card>
          <CardTitle>Active Sprints</CardTitle>
          {activeSprints.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {activeSprints.slice(0, 6).map((s) => (
                <SprintMiniCard key={s.id} sprint={s} nowMs={nowMs} />
              ))}
              {activeSprints.length > 6 && (
                <p className="col-span-full text-xs text-muted-foreground">
                  +{activeSprints.length - 6} more sprints
                </p>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">No active sprints</p>
          )}
        </Card>
      </div>

      {/* Main: Tasks + sidebar (deadlines + projects) */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* My Tasks */}
        <Card>
          <CardTitle>My Tasks</CardTitle>
          {myTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="mb-2 size-8 text-success/40" />
              <p className="text-s font-medium text-muted-foreground">
                All clear — no tasks assigned to you
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {myTasks.slice(0, 12).map((task) => (
                <Link
                  key={task.id}
                  href={`/dashboard/projects/${task.projectId}/tasks/${task.id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/60"
                >
                  <TaskTypeBadge taskType={task.taskType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {taskCode(task.taskType, task.taskNumber)}
                      </span>
                      <span className="truncate text-s text-foreground">{task.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{task.projectName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {task.estimatedMinutes != null && (
                      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                        <Clock className="size-3" />
                        {formatMinutes(task.estimatedMinutes)}
                      </span>
                    )}
                    <StatusBadge size="xs" config={taskStageBadge(task.stage)} dot dotColor={TASK_STAGE_DOT[task.stage]} />
                  </div>
                </Link>
              ))}
              {myTasks.length > 12 && (
                <p className="px-3 pt-2 text-xs text-muted-foreground">
                  +{myTasks.length - 12} more tasks
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Sidebar: Deadlines + Projects */}
        <div className="flex flex-col gap-6">
          {upcomingDeadlines.length > 0 && (
            <Card>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <div className="space-y-1">
                {upcomingDeadlines.map((dl) => (
                  <Link
                    key={dl.id}
                    href={`/dashboard/projects/${dl.projectId}?tab=notes&noteId=${dl.id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/60"
                  >
                    <CalendarClock className="size-4 shrink-0 text-orange" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-s text-foreground">{dl.title}</p>
                      <p className="text-xs text-muted-foreground">{dl.projectName}</p>
                    </div>
                    <span className={cn("shrink-0 text-xs font-semibold tabular-nums", daysLeftColor(dl.dueDate, nowMs))}>
                      {daysLeftLabel(dl.dueDate, nowMs)}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <CardTitle>My Projects</CardTitle>
              <Link
                href="/dashboard/projects"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                All <ArrowRight className="size-3" />
              </Link>
            </div>
            <div className="space-y-1">
              {projects.slice(0, 8).map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── stat card ── */

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  pulse,
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  color: string;
  bg: string;
  pulse?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className={cn("grid size-9 place-items-center rounded-xl", bg, color)}>
          <Icon className="size-4.5" />
        </div>
        {pulse && (
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-purple opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-purple" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
