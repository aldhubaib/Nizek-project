"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { TaskSidebar } from "@/components/kanban/task-sidebar";
import type { KanbanTask } from "@/store/kanban";
import type { TaskQuestion } from "@/components/kanban/question-field";
import {
  BarChart3,
  Clock,
  ListChecks,
  AtSign,
  AlertTriangle,
  FileText,
  CalendarClock,
  Users,
  Activity,
  CheckCircle2,
  Circle,
  ArrowRight,
  ChevronRight,
  Eye,
  Bug,
  Sparkles,
  Zap,
  Undo2,
  ShieldX,
} from "lucide-react";
import { getDashboardData, markMentionRead, markAllMentionsRead } from "@/actions/dashboard";
import { cn } from "@/lib/utils";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}

interface Props {
  projectId: string;
  userRole: string;
  userId: string;
  tasks: KanbanTask[];
  questions: QuestionWithType[];
}

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

const STAGE_COLORS: Record<string, string> = {
  NEW_REQUEST: "bg-muted-foreground",
  CLARIFICATION: "bg-orange",
  READY_FOR_DEV: "bg-primary",
  IN_DEVELOPMENT: "bg-violet-500",
  INTERNAL_REVIEW: "bg-orange-500",
  CLIENT_REVIEW: "bg-cyan-500",
  READY_FOR_RELEASE: "bg-success",
  DONE: "bg-success",
};

const STAGE_HEX: Record<string, string> = {
  NEW_REQUEST: "#71717a",
  CLARIFICATION: "#f59e0b",
  READY_FOR_DEV: "#3b82f6",
  IN_DEVELOPMENT: "#8b5cf6",
  INTERNAL_REVIEW: "#f97316",
  CLIENT_REVIEW: "#22d3ee",
  READY_FOR_RELEASE: "#10b981",
  DONE: "#22c55e",
};

const TYPE_ICON: Record<string, typeof Bug> = {
  BUG: Bug,
  FEATURE: Sparkles,
  ENHANCEMENT: Zap,
};

const TYPE_COLOR: Record<string, string> = {
  BUG: "text-destructive",
  FEATURE: "text-violet-400",
  ENHANCEMENT: "text-cyan-400",
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours}h ${totalMinutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ProjectDashboard({ projectId, userRole, userId, tasks: kanbanTasks, questions }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = useMemo(
    () => (selectedTaskId ? kanbanTasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [kanbanTasks, selectedTaskId]
  );

  function onNavigateToTask(taskId: string) {
    setSelectedTaskId(taskId);
  }

  useEffect(() => {
    getDashboardData(projectId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-xl">
        <div className="flex items-center gap-2 text-muted-foreground text-s">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isClient = userRole === "CLIENT";
  const isAdmin = userRole === "ADMIN";

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Tasks"
          value={data.stats.totalTasks}
          icon={<ListChecks className="w-4 h-4" />}
          color="text-primary"
        />
        <StatCard
          label="In Progress"
          value={data.stats.inProgress}
          icon={<Activity className="w-4 h-4" />}
          color="text-violet-400"
        />
        <StatCard
          label="Completed"
          value={data.stats.doneTasks}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="text-success"
        />
        <ContractCard contract={data.contract} />
      </div>

      {/* Pipeline Visual */}
      <Widget title="Stage Pipeline" icon={<BarChart3 className="w-4 h-4" />}>
        <StagePipeline pipeline={data.pipeline} total={data.stats.totalTasks} />
      </Widget>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My Mentions */}
        <Widget
          title="My Mentions"
          icon={<AtSign className="w-4 h-4" />}
          badge={data.unreadMentionCount > 0 ? data.unreadMentionCount : undefined}
          action={
            data.unreadMentionCount > 0
              ? {
                  label: "Mark all read",
                  onClick: () => {
                    startTransition(async () => {
                      await markAllMentionsRead(projectId);
                      const fresh = await getDashboardData(projectId);
                      setData(fresh);
                    });
                  },
                }
              : undefined
          }
        >
          <MentionsList
            mentions={data.mentions}
            onNavigateToTask={onNavigateToTask}
            onMarkRead={(id) => {
              startTransition(async () => {
                await markMentionRead(id);
                const fresh = await getDashboardData(projectId);
                setData(fresh);
              });
            }}
          />
        </Widget>

        {/* My Tasks */}
        <Widget title="My Tasks" icon={<ListChecks className="w-4 h-4" />}>
          <MyTasksList tasks={data.myTasks} onNavigateToTask={onNavigateToTask} />
        </Widget>

        {/* Stalling Tasks - visible to internal team */}
        {!isClient && (
          <Widget title="Stalling Tasks" icon={<AlertTriangle className="w-4 h-4" />}>
            <StallingList tasks={data.stallingTasks} onNavigateToTask={onNavigateToTask} />
          </Widget>
        )}

        {/* Rejections - visible to internal team */}
        {!isClient && (
          <Widget
            title="Rejections"
            icon={<Undo2 className="w-4 h-4" />}
            badge={data.rejections.totalInternal + data.rejections.totalClient > 0 ? data.rejections.totalInternal + data.rejections.totalClient : undefined}
          >
            <RejectionsList rejections={data.rejections} onNavigateToTask={onNavigateToTask} />
          </Widget>
        )}

        {/* Team Workload - visible to admins/PMs */}
        {!isClient && (
          <Widget title="Team Workload" icon={<Users className="w-4 h-4" />}>
            <TeamWorkload workload={data.teamWorkload} />
          </Widget>
        )}

        {/* Client Requirements */}
        <Widget title="Client Requirements" icon={<FileText className="w-4 h-4" />}>
          <ClientReqsList reqs={data.clientReqs} onNavigateToTask={onNavigateToTask} />
        </Widget>

        {/* Recent Activity */}
        <Widget title="Recent Activity" icon={<Activity className="w-4 h-4" />}>
          <ActivityList activity={data.activity} onNavigateToTask={onNavigateToTask} />
        </Widget>
      </div>

      {selectedTask && (
        <TaskSidebar
          task={selectedTask}
          open={!!selectedTask}
          onClose={() => setSelectedTaskId(null)}
          questions={questions}
          projectId={projectId}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="app-card rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={cn("opacity-70", color)}>{icon}</span>
      </div>
      <p className="text-l font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function ContractCard({
  contract,
}: {
  contract: DashboardData["contract"];
}) {
  if (!contract) {
    return (
      <div className="app-card rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="opacity-70 text-muted-foreground">
            <CalendarClock className="w-4 h-4" />
          </span>
        </div>
        <p className="text-s font-medium text-muted-foreground">No active contract</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Contract Countdown</p>
      </div>
    );
  }

  const urgent = contract.daysLeft <= 14;
  const warning = contract.daysLeft <= 30;

  return (
    <div
      className={cn(
        "app-card rounded-lg border p-4",
        urgent
          ? "border-destructive/30 bg-destructive/5"
          : warning
            ? "border-orange/30 bg-orange/5"
            : "border-border bg-card"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "opacity-70",
            urgent ? "text-destructive" : warning ? "text-orange" : "text-success"
          )}
        >
          <CalendarClock className="w-4 h-4" />
        </span>
      </div>
      <p
        className={cn(
          "text-l font-bold tracking-tight",
          urgent ? "text-destructive" : warning ? "text-orange" : ""
        )}
      >
        {contract.daysLeft}
        <span className="text-s font-normal ms-1 text-muted-foreground">days</span>
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {contract.label ?? "Contract"} ends{" "}
        {contract.endDate ? new Date(contract.endDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }) : "N/A"}
      </p>
    </div>
  );
}

function Widget({
  title,
  icon,
  badge,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: number;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="app-card rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-s font-semibold">{title}</h3>
          {badge !== undefined && badge > 0 && (
            <span className="ms-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {badge}
            </span>
          )}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="text-xs text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="p-4 max-h-[320px] overflow-y-auto">{children}</div>
    </div>
  );
}

function StagePipeline({
  pipeline,
  total,
}: {
  pipeline: Record<string, number>;
  total: number;
}) {
  const stages = [
    "NEW_REQUEST",
    "CLARIFICATION",
    "READY_FOR_DEV",
    "IN_DEVELOPMENT",
    "INTERNAL_REVIEW",
    "CLIENT_REVIEW",
    "READY_FOR_RELEASE",
    "DONE",
  ];

  const [hovered, setHovered] = useState<string | null>(null);

  const radius = 80;
  const stroke = 28;
  const center = radius + stroke / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = stages
    .filter((s) => (pipeline[s] ?? 0) > 0)
    .map((stage) => {
      const count = pipeline[stage] ?? 0;
      const pct = total > 0 ? count / total : 0;
      const dashLen = pct * circumference;
      const gap = circumference - dashLen;
      const rotation = (offset / total) * 360;
      offset += count;
      return { stage, count, pct, dashLen, gap, rotation };
    });

  const hoveredArc = arcs.find((a) => a.stage === hovered);
  const centerLabel = hoveredArc
    ? { value: hoveredArc.count, label: STAGE_LABELS[hoveredArc.stage] }
    : { value: total, label: "Total Tasks" };

  return (
    <div className="flex items-center gap-6">
      <div className="shrink-0">
        <svg
          width={center * 2}
          height={center * 2}
          viewBox={`0 0 ${center * 2} ${center * 2}`}
          className="w-[160px] h-[160px]"
        >
          {total === 0 && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-muted/30"
              strokeWidth={stroke}
            />
          )}
          {arcs.map((arc) => (
            <circle
              key={arc.stage}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={STAGE_HEX[arc.stage]}
              strokeWidth={stroke}
              strokeDasharray={`${arc.dashLen} ${arc.gap}`}
              strokeDashoffset={0}
              strokeLinecap="butt"
              transform={`rotate(${arc.rotation - 90} ${center} ${center})`}
              className="transition-opacity duration-150"
              style={{ opacity: hovered && hovered !== arc.stage ? 0.3 : 1 }}
              onMouseEnter={() => setHovered(arc.stage)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          <text
            x={center}
            y={center - 6}
            textAnchor="middle"
            className="fill-foreground text-l font-bold"
          >
            {centerLabel.value}
          </text>
          <text
            x={center}
            y={center + 12}
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            {centerLabel.label}
          </text>
        </svg>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2">
        {stages.map((stage) => {
          const count = pipeline[stage] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div
              key={stage}
              className={cn(
                "flex items-center gap-2 py-1 px-2 rounded-md transition-colors cursor-default",
                hovered === stage && "bg-muted/50"
              )}
              onMouseEnter={() => setHovered(stage)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: STAGE_HEX[stage] }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground truncate block">
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              <span className="text-s font-semibold tabular-nums">{count}</span>
              <span className="text-xs text-muted-foreground/60 w-7 text-end tabular-nums">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MentionsList({
  mentions,
  onMarkRead,
  onNavigateToTask,
}: {
  mentions: DashboardData["mentions"];
  onMarkRead: (id: string) => void;
  onNavigateToTask?: (taskId: string) => void;
}) {
  if (mentions.length === 0) {
    return (
      <EmptyState icon={<AtSign className="w-8 h-8" />} message="No mentions yet" />
    );
  }

  return (
    <div className="space-y-1">
      {mentions.map((m) => (
        <div
          key={m.id}
          className={cn(
            "flex items-start gap-3 p-2.5 rounded-md transition-colors cursor-pointer",
            !m.readAt ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
          )}
          onClick={() => onNavigateToTask?.(m.taskId)}
        >
          {!m.readAt && (
            <div className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-xs text-s">
              {m.commentedBy.imageUrl ? (
                <img
                  src={m.commentedBy.imageUrl}
                  alt=""
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                  {(m.commentedBy.name ?? "?")[0]}
                </div>
              )}
              <span className="font-medium">{m.commentedBy.name}</span>
              <span className="text-muted-foreground">mentioned you in</span>
              <span className="font-medium truncate">
                #{m.taskNumber} {m.taskTitle}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {m.comment}
            </p>
            <span className="text-xs text-muted-foreground/60 mt-1 block">
              {timeAgo(m.commentedAt)}
            </span>
          </div>
          {!m.readAt && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkRead(m.id); }}
              className="shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Mark as read"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function MyTasksList({ tasks, onNavigateToTask }: { tasks: DashboardData["myTasks"]; onNavigateToTask?: (taskId: string) => void }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="w-8 h-8" />}
        message="No tasks assigned to you"
      />
    );
  }

  const grouped: Record<string, typeof tasks> = {};
  for (const t of tasks) {
    if (!grouped[t.stage]) grouped[t.stage] = [];
    grouped[t.stage].push(t);
  }

  const stageOrder = [
    "IN_DEVELOPMENT",
    "READY_FOR_DEV",
    "INTERNAL_REVIEW",
    "CLIENT_REVIEW",
    "READY_FOR_RELEASE",
    "CLARIFICATION",
    "NEW_REQUEST",
    "DONE",
  ];

  return (
    <div className="space-y-3">
      {stageOrder.map((stage) => {
        const items = grouped[stage];
        if (!items?.length) return null;
        return (
          <div key={stage}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn("w-2 h-2 rounded-full", STAGE_COLORS[stage])} />
              <span className="text-xs font-medium text-muted-foreground">
                {STAGE_LABELS[stage]}
              </span>
              <span className="text-xs text-muted-foreground/60">{items.length}</span>
            </div>
            <div className="space-y-1 ms-4">
              {items.map((t) => (
                <TaskRow key={t.id} task={t} onClick={() => onNavigateToTask?.(t.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({
  task,
  onClick,
}: {
  task: { id: string; title: string; taskNumber: number; taskType: string; priority: number | null };
  onClick?: () => void;
}) {
  const Icon = TYPE_ICON[task.taskType] ?? Circle;
  return (
    <div className="flex items-center gap-2 py-1 text-s cursor-pointer rounded-md px-1 -mx-1 hover:bg-muted/50 transition-colors" onClick={onClick}>
      <Icon className={cn("w-3.5 h-3.5 shrink-0", TYPE_COLOR[task.taskType] ?? "text-muted-foreground")} />
      <span className="text-muted-foreground font-mono">#{task.taskNumber}</span>
      <span className="truncate flex-1">{task.title}</span>
      {task.priority !== null && (
        <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-muted text-xs font-bold">
          P{task.priority}
        </span>
      )}
    </div>
  );
}

function StallingList({ tasks, onNavigateToTask }: { tasks: DashboardData["stallingTasks"]; onNavigateToTask?: (taskId: string) => void }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="w-8 h-8" />}
        message="All tasks are on track"
      />
    );
  }

  return (
    <div className="space-y-1">
      {tasks.map((t) => {
        if (!t) return null;
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onNavigateToTask?.(t.id)}
          >
            <AlertTriangle className="w-4 h-4 text-orange shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-s">
                <span className="text-muted-foreground font-mono">#{t.taskNumber}</span>
                <span className="truncate font-medium">{t.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STAGE_COLORS[t.stage], "bg-opacity-20 text-foreground")}>
                  {STAGE_LABELS[t.stage]}
                </span>
                <span>
                  <Clock className="w-3 h-3 inline me-0.5" />
                  {formatDuration(t.timeInStage)} in stage
                </span>
                <span className="text-orange font-medium">
                  {t.ratio.toFixed(1)}x avg
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamWorkload({
  workload,
}: {
  workload: DashboardData["teamWorkload"];
}) {
  if (workload.length === 0) {
    return (
      <EmptyState icon={<Users className="w-8 h-8" />} message="No active assignments" />
    );
  }

  const maxCount = Math.max(...workload.map((w) => w.count), 1);

  return (
    <div className="space-y-2">
      {workload.map((member) => (
        <div key={member.id} className="flex items-center gap-3">
          {member.imageUrl ? (
            <img
              src={member.imageUrl}
              alt=""
              className="w-6 h-6 rounded-full shrink-0"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
              {(member.name ?? "?")[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-s font-medium truncate">{member.name}</span>
              <span className="text-xs text-muted-foreground">{member.count} tasks</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${(member.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientReqsList({ reqs, onNavigateToTask }: { reqs: DashboardData["clientReqs"]; onNavigateToTask?: (taskId: string) => void }) {
  if (reqs.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-8 h-8" />}
        message="No pending client requirements"
      />
    );
  }

  return (
    <div className="space-y-1">
      {reqs.map((r) => {
        if (!r) return null;
        return (
          <div
            key={`${r.taskId}`}
            className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onNavigateToTask?.(r.taskId)}
          >
            <FileText className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-s">
                <span className="text-muted-foreground font-mono">#{r.taskNumber}</span>
                <span className="truncate font-medium">{r.title}</span>
              </div>
              {r.note && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {r.note}
                </p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground/60">
                  {STAGE_LABELS[r.stage]}
                </span>
                {r.priority !== null && (
                  <span className="text-xs font-bold text-muted-foreground">P{r.priority}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityList({ activity, onNavigateToTask }: { activity: DashboardData["activity"]; onNavigateToTask?: (taskId: string) => void }) {
  if (activity.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="w-8 h-8" />}
        message="No recent activity"
      />
    );
  }

  function describeAction(item: DashboardData["activity"][number]): string {
    if (item.action === "created") return "created";
    if (item.action === "moved" && item.field === "stage") {
      return `moved to ${STAGE_LABELS[item.newValue ?? ""] ?? item.newValue}`;
    }
    if (item.action === "updated" && item.field) {
      return `updated ${item.field}`;
    }
    return item.action;
  }

  return (
    <div className="space-y-1">
      {activity.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
          onClick={() => onNavigateToTask?.(item.task.id)}
        >
          {item.user.imageUrl ? (
            <img
              src={item.user.imageUrl}
              alt=""
              className="w-5 h-5 rounded-full shrink-0 mt-0.5"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              {(item.user.name ?? "?")[0]}
            </div>
          )}
          <div className="flex-1 min-w-0 text-s">
            <span className="font-medium">{item.user.name}</span>{" "}
            <span className="text-muted-foreground">{describeAction(item)}</span>{" "}
            <span className="font-medium">
              #{item.task.taskNumber} {item.task.title}
            </span>
            <span className="block text-xs text-muted-foreground/60 mt-0.5">
              {timeAgo(item.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RejectionsList({
  rejections,
  onNavigateToTask,
}: {
  rejections: DashboardData["rejections"];
  onNavigateToTask?: (taskId: string) => void;
}) {
  if (rejections.tasks.length === 0) {
    return (
      <EmptyState icon={<CheckCircle2 className="w-8 h-8" />} message="No rejections" />
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4 px-2.5 pb-2 mb-1 border-b border-border/50">
        <div className="flex items-center gap-xs">
          <span className="w-2 h-2 rounded-full bg-orange" />
          <span className="text-xs text-muted-foreground">Internal</span>
          <span className="text-s font-bold text-orange">{rejections.totalInternal}</span>
        </div>
        <div className="flex items-center gap-xs">
          <span className="w-2 h-2 rounded-full bg-destructive" />
          <span className="text-xs text-muted-foreground">Client</span>
          <span className="text-s font-bold text-destructive">{rejections.totalClient}</span>
        </div>
      </div>
      {rejections.tasks.map((r) => {
        const total = r.internal.count + r.client.count;
        const Icon = TYPE_ICON[r.task.taskType] ?? Circle;
        return (
          <div
            key={r.task.id}
            className="flex items-center gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onNavigateToTask?.(r.task.id)}
          >
            <Icon className={cn("w-4 h-4 shrink-0", TYPE_COLOR[r.task.taskType] ?? "text-muted-foreground")} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-s">
                <span className="text-muted-foreground font-mono">#{r.task.taskNumber}</span>
                <span className="truncate font-medium">{r.task.title}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                {r.internal.count > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange">
                    <Undo2 className="w-2.5 h-2.5" />
                    {r.internal.count} internal
                  </span>
                )}
                {r.client.count > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                    <ShieldX className="w-2.5 h-2.5" />
                    {r.client.count} client
                  </span>
                )}
                <span className="text-xs text-muted-foreground/60 ms-auto">
                  {total} total
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <span className="text-muted-foreground/30 mb-2">{icon}</span>
      <p className="text-s text-muted-foreground">{message}</p>
    </div>
  );
}
