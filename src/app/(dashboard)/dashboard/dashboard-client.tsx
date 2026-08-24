"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
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
}

function daysLeft(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function daysLeftLabel(iso: string): string {
  const d = daysLeft(iso);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Tomorrow";
  return `${d}d left`;
}

function daysLeftColor(iso: string): string {
  const d = daysLeft(iso);
  if (d < 0) return "text-destructive";
  if (d <= 2) return "text-orange";
  if (d <= 7) return "text-orange";
  return "text-success";
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  count,
  href,
  iconColor,
}: {
  icon: typeof Inbox;
  title: string;
  count?: number;
  href?: string;
  iconColor?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "grid size-8 place-items-center rounded-lg",
            iconColor ?? "bg-primary/15 text-primary",
          )}
        >
          <Icon className="size-4" />
        </div>
        <h2 className="text-s font-semibold text-foreground">{title}</h2>
        {count != null && count > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold leading-5 text-primary-foreground">
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

function StageDot({ stage }: { stage: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        TASK_STAGE_DOT[stage] ?? "bg-muted-foreground",
      )}
    />
  );
}

export function DashboardClient({
  userName,
  unreadCount,
  myTasks,
  stageBreakdown,
  projects,
  activeSprints,
  upcomingDeadlines,
}: Props) {
  const greeting = getGreeting();
  const totalTasks = myTasks.length;
  const inDev = stageBreakdown["IN_DEVELOPMENT"] ?? 0;
  const inReview =
    (stageBreakdown["INTERNAL_REVIEW"] ?? 0) +
    (stageBreakdown["CLIENT_REVIEW"] ?? 0);
  const todo = stageBreakdown["READY_FOR_DEV"] ?? 0;

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
        <StatCard
          label="My tasks"
          value={totalTasks}
          icon={CheckCircle2}
          color="text-primary"
          bg="bg-primary/15"
        />
        <StatCard
          label="In development"
          value={inDev}
          icon={Flame}
          color="text-sky-400"
          bg="bg-sky-400/15"
        />
        <StatCard
          label="In review"
          value={inReview}
          icon={Clock}
          color="text-orange"
          bg="bg-orange/15"
        />
        <Link href="/dashboard/messages">
          <StatCard
            label="Unread messages"
            value={unreadCount}
            icon={Inbox}
            color="text-purple"
            bg="bg-purple/15"
            pulse={unreadCount > 0}
          />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: My Tasks */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              icon={CheckCircle2}
              title="My Tasks"
              count={totalTasks}
            />
            {myTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="mb-2 size-8 text-success/40" />
                <p className="text-s font-medium text-muted-foreground">
                  All clear — no tasks assigned to you
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {myTasks.slice(0, 10).map((task) => (
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
                        <span className="truncate text-s text-foreground">
                          {task.title}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {task.projectName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {task.estimatedMinutes && (
                        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                          <Clock className="size-3" />
                          {formatMinutes(task.estimatedMinutes)}
                        </span>
                      )}
                      <StatusBadge
                        size="xs"
                        config={taskStageBadge(task.stage)}
                        dot
                        dotColor={TASK_STAGE_DOT[task.stage]}
                      />
                    </div>
                  </Link>
                ))}
                {myTasks.length > 10 && (
                  <p className="px-3 pt-2 text-xs text-muted-foreground">
                    +{myTasks.length - 10} more tasks
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Active Sprints */}
          {activeSprints.length > 0 && (
            <Card>
              <CardHeader
                icon={FolderKanban}
                title="Active Sprints"
                iconColor="bg-success/15 text-success"
              />
              <div className="space-y-3">
                {activeSprints.map((sprint) => {
                  const left = daysLeft(sprint.endDate);
                  return (
                    <Link
                      key={sprint.id}
                      href={`/dashboard/projects/${sprint.projectId}?tab=sprints`}
                      className="block rounded-xl border border-border/40 p-3 transition-colors hover:border-border"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-s font-semibold text-foreground">
                          {sprint.name}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            daysLeftColor(sprint.endDate),
                          )}
                        >
                          {daysLeftLabel(sprint.endDate)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{sprint.projectName}</span>
                        <span>·</span>
                        <span>{sprint.taskCount} tasks</span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            left <= 2 ? "bg-orange" : "bg-success",
                          )}
                          style={{
                            width: `${Math.min(100, Math.max(5, sprintProgress(sprint.startDate, sprint.endDate)))}%`,
                          }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Upcoming Deadlines */}
          {upcomingDeadlines.length > 0 && (
            <Card>
              <CardHeader
                icon={CalendarClock}
                title="Deadlines"
                iconColor="bg-orange/15 text-orange"
              />
              <div className="space-y-2">
                {upcomingDeadlines.map((dl) => (
                  <Link
                    key={dl.id}
                    href={`/dashboard/projects/${dl.projectId}?tab=notes&noteId=${dl.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-accent/60"
                  >
                    <CalendarClock className="size-4 shrink-0 text-orange" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-s text-foreground">
                        {dl.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dl.projectName}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        daysLeftColor(dl.dueDate),
                      )}
                    >
                      {daysLeftLabel(dl.dueDate)}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* My Projects */}
          <Card>
            <CardHeader
              icon={FolderKanban}
              title="My Projects"
              count={projects.length}
              href="/dashboard/projects"
              iconColor="bg-violet/15 text-violet"
            />
            <div className="space-y-2">
              {projects.slice(0, 8).map((proj) => (
                <Link
                  key={proj.id}
                  href={`/dashboard/projects/${proj.id}?tab=board`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-accent/60"
                >
                  {proj.logoUrl ? (
                    <img
                      src={proj.logoUrl}
                      alt=""
                      className="size-7 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <Avatar size="sm">
                      <AvatarFallback>
                        {proj.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-s font-medium text-foreground">
                      {proj.name}
                    </p>
                    {proj.activeSprint ? (
                      <p className="text-xs text-muted-foreground">
                        {proj.activeSprint.name} ·{" "}
                        {proj.activeSprint.taskCount} tasks
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {proj.openTasks} open tasks
                      </p>
                    )}
                  </div>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40" />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

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
        <div
          className={cn(
            "grid size-9 place-items-center rounded-xl",
            bg,
            color,
          )}
        >
          <Icon className="size-4.5" />
        </div>
        {pulse && (
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-purple opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-purple" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function sprintProgress(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return ((now - start) / (end - start)) * 100;
}
