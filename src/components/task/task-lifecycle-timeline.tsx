"use client";

import { useMemo, useState } from "react";
import {
  Clock, History, List, MessageSquare, ArrowLeftRight, Undo2, PauseCircle,
  FileText, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar as UiAvatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { stageLabel, taskStageBadge, TASK_STAGE_DOT, outlineBadge } from "@/lib/task-label";
import {
  describeActivity, describeStageVisit, formatDuration, isStageEcho, orderStages, timeAgo,
} from "@/lib/task-history-format";
import type { StageVisit, TaskHistoryActivity, TaskHistorySummary } from "@/actions/task-history";

export interface TimelineAttachment {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
}

export interface TimelineComment {
  id: string;
  content: string;
  createdAt: Date | string;
  user: { id: string; name: string | null; imageUrl: string | null };
  attachments: TimelineAttachment[];
}

type FilterMode = "all" | "comments" | "status";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

interface Row {
  key: string;
  at: Date;
  visit?: StageVisit;
  activity?: TaskHistoryActivity;
  comment?: TimelineComment;
}

interface Props {
  visits: StageVisit[];
  activities: TaskHistoryActivity[];
  summary: TaskHistorySummary;
  comments?: TimelineComment[];
  /** Compact spacing for the embedded copy on the task detail page. */
  dense?: boolean;
}

/**
 * The lifecycle of a task, in two layers.
 *
 * The spine is `StageLog`: one row per stage visit, each a stored fact about
 * who moved the task, from where, how long it then sat, and under which sprint.
 * `TaskActivity` and comments are merged in underneath as detail.
 *
 * This replaces a version that reconstructed the whole thing by replaying the
 * activity log and subtracting timestamps. That could only see user-driven
 * moves, so anything the sprint layer did was missing and its elapsed time was
 * credited to the wrong stage — the durations it printed were confidently wrong.
 */
export function TaskLifecycleTimeline({
  visits, activities, summary, comments = [], dense = false,
}: Props) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const { rows, counts, stagesPresent, totalsByStage } = useMemo(() => {
    const totals = new Map(summary.stageTotals.map((t) => [t.stage as string, t]));

    const visitRows: Row[] = visits.map((v) => ({
      key: `s-${v.id}`,
      at: new Date(v.enteredAt),
      visit: v,
    }));

    // Stage moves already appear on the spine; their activity rows would
    // otherwise print the same transition a second time.
    const detailRows: Row[] = activities
      .filter((a) => !isStageEcho(a))
      .map((a) => ({ key: `a-${a.id}`, at: new Date(a.createdAt), activity: a }));

    const commentRows: Row[] = comments.map((c) => ({
      key: `c-${c.id}`,
      at: new Date(c.createdAt),
      comment: c,
    }));

    const merged = [...visitRows, ...detailRows, ...commentRows].sort(
      (a, b) => b.at.getTime() - a.at.getTime(),
    );

    return {
      rows: merged,
      counts: {
        all: merged.length,
        comments: commentRows.length,
        status: visitRows.length,
      },
      stagesPresent: orderStages([...totals.keys()]),
      totalsByStage: totals,
    };
  }, [visits, activities, comments, summary.stageTotals]);

  const visibleRows = rows.filter((r) => {
    if (filter === "comments") return !!r.comment;
    if (filter === "status") {
      if (!r.visit) return false;
      return !stageFilter || r.visit.stage === stageFilter;
    }
    return true;
  });

  const selectedTotal = stageFilter ? totalsByStage.get(stageFilter) : undefined;

  function selectFilter(mode: FilterMode) {
    setFilter(mode);
    if (mode !== "status") setStageFilter(null);
  }

  const FILTERS: { id: FilterMode; label: string; icon: typeof List; count: number }[] = [
    { id: "all", label: "All", icon: List, count: counts.all },
    { id: "comments", label: "Internal Comments", icon: MessageSquare, count: counts.comments },
    { id: "status", label: "Status", icon: ArrowLeftRight, count: counts.status },
  ];

  return (
    <div className="flex min-h-0 flex-col">
      <Summary summary={summary} />

      <div className="flex items-center gap-xs border-b border-border py-2.5">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => selectFilter(f.id)}
              className={cn(
                "inline-flex items-center gap-xs rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary/30 bg-primary/15 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {f.label}
              <span className={cn("tabular-nums", active ? "text-primary/70" : "text-muted-foreground/50")}>
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      {filter === "status" && stagesPresent.length > 0 && (
        <div className="space-y-2 border-b border-border py-2.5">
          <div className="flex flex-wrap items-center gap-xs">
            <button
              onClick={() => setStageFilter(null)}
              className={cn(
                "inline-flex items-center gap-xs rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                stageFilter === null
                  ? "border-foreground/20 bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              All statuses
            </button>
            {stagesPresent.map((s) => (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className={cn(
                  "inline-flex items-center gap-xs rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                  stageFilter === s
                    ? "border-primary/30 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", TASK_STAGE_DOT[s] ?? "bg-primary")} />
                {stageLabel(s)}
              </button>
            ))}
          </div>
          {selectedTotal && (
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <span className="flex items-center gap-xs text-xs font-medium text-foreground/80">
                <span className={cn("h-2 w-2 rounded-full", TASK_STAGE_DOT[stageFilter!] ?? "bg-primary")} />
                Total in {stageLabel(stageFilter)}
                {stageFilter === summary.currentStage && (
                  <span className="text-xs text-primary">(ongoing)</span>
                )}
              </span>
              <span className="font-mono text-s font-semibold tabular-nums text-primary">
                {formatDuration(selectedTotal.ms)}
                <span className="ms-1.5 text-xs font-normal text-muted-foreground">
                  · {selectedTotal.visits} {selectedTotal.visits === 1 ? "visit" : "visits"}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className={cn("relative min-h-0 flex-1 overflow-y-auto", dense ? "py-2" : "py-4")}>
        <div className="absolute bottom-2 left-[9px] top-2 w-px bg-border" />
        {visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <History className="h-6 w-6 text-muted-foreground opacity-40" strokeWidth={1.5} />
            <p className="text-xs text-muted-foreground/60">Nothing to show</p>
          </div>
        ) : (
          visibleRows.map((r) =>
            r.visit ? (
              <StageRow key={r.key} visit={r.visit} />
            ) : r.comment ? (
              <CommentRow key={r.key} comment={r.comment} />
            ) : r.activity ? (
              <ActivityRow key={r.key} activity={r.activity} />
            ) : null,
          )
        )}
      </div>
    </div>
  );
}

function Summary({ summary }: { summary: TaskHistorySummary }) {
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-border pb-3 sm:grid-cols-4">
      <Stat icon={Clock} label="Total age" value={formatDuration(summary.totalMs)} />
      <Stat
        icon={History}
        label={summary.currentStage ? `In ${stageLabel(summary.currentStage)}` : "Current stage"}
        value={summary.currentStage ? formatDuration(summary.currentStageMs) : "—"}
      />
      <Stat
        icon={Undo2}
        label="Went backwards"
        value={`${summary.regressions}×`}
        tone={summary.regressions > 0 ? "text-orange" : undefined}
      />
      <Stat
        icon={PauseCircle}
        label="Outside a sprint"
        value={formatDuration(summary.timeOutsideSprintMs)}
      />
    </div>
  );
}

function Stat({
  icon: Icon, label, value, tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-field px-2.5 py-2">
      <p className="flex items-center gap-xs text-xs text-muted-foreground">
        <Icon className="h-3 w-3" strokeWidth={1.5} />
        {label}
      </p>
      <p className={cn("mt-0.5 font-mono text-s font-semibold tabular-nums", tone ?? "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

function Avatar({ user }: { user: { name: string | null; imageUrl: string | null } | null }) {
  return (
    <UiAvatar size="xs" className="ring-2 ring-card">
      {user?.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
      <AvatarFallback className="font-bold">
        {user?.name?.charAt(0)?.toUpperCase() ?? "•"}
      </AvatarFallback>
    </UiAvatar>
  );
}

function StageRow({ visit }: { visit: StageVisit }) {
  const dot = TASK_STAGE_DOT[visit.stage] ?? "bg-primary";
  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative z-10 mt-1 shrink-0">
        {visit.actor ? (
          <Avatar user={visit.actor} />
        ) : (
          <span className={cn("block h-[18px] w-[18px] rounded-full ring-2 ring-card", dot)}>
            {visit.ongoing && (
              <span className={cn("block h-full w-full animate-ping rounded-full opacity-40", dot)} />
            )}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-s leading-snug text-foreground/80">{describeStageVisit(visit)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-xs">
          <span className="me-0.5 text-xs text-muted-foreground/50">{timeAgo(visit.enteredAt)}</span>
          <StatusBadge
            config={{ ...taskStageBadge(visit.stage), label: formatDuration(visit.durationMs) }}
            icon={Clock}
            className="tabular-nums"
          />
          <StatusBadge config={taskStageBadge(visit.stage)} dot dotColor={TASK_STAGE_DOT[visit.stage]} />
          {visit.ongoing && (
            <StatusBadge config={outlineBadge("ongoing", "text-primary", "border-primary/30")} />
          )}
          {visit.sprintName && (
            <StatusBadge
              config={outlineBadge(visit.sprintName, "text-muted-foreground", "border-border")}
            />
          )}
          {visit.assignee?.name && (
            <span className="text-xs text-muted-foreground/60">held by {visit.assignee.name}</span>
          )}
        </div>
        {visit.reason && (
          <p className="mt-1 rounded-md border border-border/60 bg-field px-2 py-1 text-xs text-muted-foreground">
            {visit.reason}
          </p>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: TaskHistoryActivity }) {
  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative z-10 mt-1 shrink-0">
        <Avatar user={activity.user} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-s leading-snug text-foreground/80">{describeActivity(activity)}</p>
        <span className="text-xs text-muted-foreground/50">{timeAgo(activity.createdAt)}</span>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CommentRow({ comment }: { comment: TimelineComment }) {
  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative z-10 mt-1 shrink-0">
        <Avatar user={comment.user} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-s font-semibold text-foreground/90">{comment.user.name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground/50">commented internally</span>
          <span className="text-xs text-muted-foreground/50">· {timeAgo(comment.createdAt)}</span>
        </div>
        <div className="mt-1 rounded-lg border border-border/60 bg-field px-2.5 py-2">
          <p className="whitespace-pre-wrap break-words text-s leading-relaxed text-foreground/80">
            {comment.content}
          </p>
          {comment.attachments?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-xs">
              {comment.attachments.map((a) =>
                a.mimeType && IMAGE_TYPES.includes(a.mimeType) ? (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="overflow-hidden rounded-md border border-border transition-colors hover:border-primary/50"
                  >
                    <img src={a.url} alt={a.filename} className="h-14 w-14 object-cover" />
                  </a>
                ) : (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-xs rounded-md border border-border bg-muted/30 px-2 py-1.5 transition-colors hover:border-primary/50"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="max-w-[120px] truncate text-xs text-foreground/70">{a.filename}</span>
                    {a.fileSize && (
                      <span className="shrink-0 text-xs text-muted-foreground/50">
                        {formatFileSize(a.fileSize)}
                      </span>
                    )}
                    <Download className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  </a>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
