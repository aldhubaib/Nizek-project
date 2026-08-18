"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, History, Clock, Loader2, List, MessageSquare, ArrowLeftRight,
  FileText, Download,
} from "lucide-react";
import { getTaskActivities } from "@/actions/activity";
import { getComments } from "@/actions/comment";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
}

interface Attachment {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
  attachments: Attachment[];
}

type FilterMode = "all" | "comments" | "status";

const STAGE_LABEL: Record<string, string> = {
  NEW_REQUEST: "New Request",
  CLARIFICATION: "Clarification",
  READY_FOR_DEV: "Ready for Dev",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  READY_FOR_RELEASE: "Ready for Release",
  DONE: "Done",
};

const STAGE_DOT: Record<string, string> = {
  NEW_REQUEST: "bg-muted-foreground",
  CLARIFICATION: "bg-violet-500",
  READY_FOR_DEV: "bg-primary",
  IN_DEVELOPMENT: "bg-sky-500",
  INTERNAL_REVIEW: "bg-orange",
  CLIENT_REVIEW: "bg-orange-500",
  READY_FOR_RELEASE: "bg-teal-500",
  DONE: "bg-success",
};

const STAGE_BADGE: Record<string, string> = {
  NEW_REQUEST: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
  CLARIFICATION: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  READY_FOR_DEV: "bg-primary/10 text-primary border-primary/20",
  IN_DEVELOPMENT: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  INTERNAL_REVIEW: "bg-orange/10 text-orange border-orange/20",
  CLIENT_REVIEW: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  READY_FOR_RELEASE: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  DONE: "bg-success/10 text-success border-success/20",
};

function stageBadgeClass(stage: string | null): string {
  if (!stage) return "bg-muted/60 text-muted-foreground border-border";
  return STAGE_BADGE[stage] ?? "bg-muted/60 text-muted-foreground border-border";
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

function isTransition(a: Activity): boolean {
  return (a.action === "moved" || a.action === "declined") && a.field === "stage";
}

function stageLabel(val: string | null): string {
  if (!val) return "—";
  return STAGE_LABEL[val] ?? val;
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function timeAgo(date: Date): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function describeActivity(a: Activity): string {
  const name = a.user.name ?? "Someone";
  switch (a.action) {
    case "created":
      return `${name} created this task`;
    case "moved":
      return `${name} moved from ${stageLabel(a.oldValue)} → ${stageLabel(a.newValue)}`;
    case "declined":
      return `${name} declined & returned to ${stageLabel(a.newValue)}`;
    case "assigned":
      return `${name} assigned to ${stageLabel(a.newValue)}`;
    case "unassigned":
      return `${name} unassigned ${stageLabel(a.oldValue)}`;
    case "archived":
      return `${name} archived this task`;
    case "restored":
      return `${name} restored this task`;
    case "updated":
      if (a.field === "priority") return `${name} changed priority from ${a.oldValue ?? "—"} to ${a.newValue ?? "—"}`;
      if (a.field === "title") return `${name} renamed task`;
      return `${name} updated ${a.field ?? "task"}`;
    case "answered":
      return `${name} updated an answer`;
    case "note_created":
      return `${name} added a note${a.newValue ? `: ${a.newValue}` : ""}`;
    case "transferred":
      return `${name} removed ${a.oldValue ?? "a member"} → assigned ${a.newValue ?? "another member"}`;
    default:
      return `${name} ${a.action}`;
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TimelineItem {
  key: string;
  createdAt: Date;
  isComment: boolean;
  activity?: Activity;
  comment?: Comment;
  durationMs?: number;
  durationStage?: string | null;
}

function Avatar({ user }: { user: { name: string | null; imageUrl: string | null } }) {
  if (user.imageUrl) {
    return <img src={user.imageUrl} alt="" className="w-[18px] h-[18px] rounded-full ring-2 ring-card object-cover" />;
  }
  return (
    <div className="w-[18px] h-[18px] rounded-full bg-muted ring-2 ring-card flex items-center justify-center">
      <span className="text-xs font-bold text-muted-foreground">
        {user.name?.charAt(0)?.toUpperCase() ?? "?"}
      </span>
    </div>
  );
}

interface Props {
  taskId: string;
  refreshKey?: number;
  onClose: () => void;
}

export function TaskHistoryDialog({ taskId, refreshKey, onClose }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTaskActivities(taskId), getComments(taskId)])
      .then(([acts, commentRes]) => {
        setActivities(acts as Activity[]);
        if (commentRes && (commentRes as { success: boolean }).success) {
          setComments((commentRes as unknown as { comments: Comment[] }).comments);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId, refreshKey]);

  const { items, totalMs, currentStage, currentStageMs, counts, stageTotals, stagesPresent } = useMemo(() => {
    const asc = [...activities].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const created = asc.find((a) => a.action === "created");
    const startTime = created
      ? new Date(created.createdAt).getTime()
      : asc.length > 0
        ? new Date(asc[0].createdAt).getTime()
        : Date.now();
    const now = Date.now();

    // Compute how long the task spent in each stage that it left, plus
    // accumulated totals per stage (summed across every visit).
    const durationById = new Map<string, number>();
    const totals = new Map<string, { ms: number; visits: number }>();
    const bump = (s: string, ms: number) => {
      const e = totals.get(s) ?? { ms: 0, visits: 0 };
      e.ms += ms;
      totals.set(s, e);
    };
    const visit = (s: string) => {
      const e = totals.get(s) ?? { ms: 0, visits: 0 };
      e.visits += 1;
      totals.set(s, e);
    };

    let prevStageTime = startTime;
    let curStage: string | null = null;
    let lastTransitionTime = startTime;
    let transitionCount = 0;
    let firstTransition = true;
    for (const a of asc) {
      if (isTransition(a)) {
        const t = new Date(a.createdAt).getTime();
        if (firstTransition && a.oldValue) visit(a.oldValue);
        firstTransition = false;
        durationById.set(a.id, t - prevStageTime);
        if (a.oldValue) bump(a.oldValue, t - prevStageTime);
        if (a.newValue) visit(a.newValue);
        prevStageTime = t;
        curStage = a.newValue;
        lastTransitionTime = t;
        transitionCount += 1;
      }
    }
    if (curStage) bump(curStage, now - lastTransitionTime);

    const orderedStages = Object.keys(STAGE_LABEL).filter((s) => totals.has(s));

    const activityItems: TimelineItem[] = activities.map((a) => ({
      key: `a-${a.id}`,
      createdAt: new Date(a.createdAt),
      isComment: false,
      activity: a,
      durationMs: durationById.has(a.id) ? durationById.get(a.id) : undefined,
      durationStage: isTransition(a) ? a.oldValue : undefined,
    }));

    const commentItems: TimelineItem[] = comments.map((c) => ({
      key: `c-${c.id}`,
      createdAt: new Date(c.createdAt),
      isComment: true,
      comment: c,
    }));

    const merged = [...activityItems, ...commentItems].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    return {
      items: merged,
      totalMs: now - startTime,
      currentStage: curStage,
      currentStageMs: now - lastTransitionTime,
      counts: {
        all: merged.length,
        comments: commentItems.length,
        status: transitionCount,
      },
      stageTotals: totals,
      stagesPresent: orderedStages,
    };
  }, [activities, comments]);

  const visibleItems = items.filter((it) => {
    if (filter === "comments") return it.isComment;
    if (filter === "status") {
      if (!it.activity || !isTransition(it.activity)) return false;
      if (statusFilter) {
        // A stage's duration is recorded on the transition that LEFT it
        // (oldValue), so only those rows represent time spent in that stage.
        return it.activity.oldValue === statusFilter;
      }
      return true;
    }
    return true;
  });

  const showCurrentStage =
    filter !== "comments" && currentStage && (!statusFilter || statusFilter === currentStage);

  const selectedTotal = statusFilter ? stageTotals.get(statusFilter) : undefined;

  function selectFilter(mode: FilterMode) {
    setFilter(mode);
    if (mode !== "status") setStatusFilter(null);
  }

  const FILTERS: { id: FilterMode; label: string; icon: typeof List; count: number }[] = [
    { id: "all", label: "All", icon: List, count: counts.all },
    { id: "comments", label: "Comments", icon: MessageSquare, count: counts.comments },
    { id: "status", label: "Status", icon: ArrowLeftRight, count: counts.status },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
          <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-s font-semibold">Task History</h3>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80">
            <Clock className="w-3 h-3 text-muted-foreground" />
            Total {formatDuration(totalMs)}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-xs px-5 py-2.5 border-b border-border shrink-0">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => selectFilter(f.id)}
                className={cn(
                  "inline-flex items-center gap-xs rounded-md px-2.5 py-1 text-xs font-medium transition-colors border",
                  active
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="w-3 h-3" />
                {f.label}
                <span className={cn("tabular-nums", active ? "text-primary/70" : "text-muted-foreground/50")}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Stage picker (when filtering by status) */}
        {filter === "status" && stagesPresent.length > 0 && (
          <div className="px-5 py-2.5 border-b border-border shrink-0 space-y-2">
            <div className="flex items-center gap-xs flex-wrap">
              <button
                onClick={() => setStatusFilter(null)}
                className={cn(
                  "inline-flex items-center gap-xs rounded-full px-2 py-0.5 text-xs font-medium transition-colors border",
                  statusFilter === null
                    ? "bg-foreground/10 border-foreground/20 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                All statuses
              </button>
              {stagesPresent.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "inline-flex items-center gap-xs rounded-full px-2 py-0.5 text-xs font-medium transition-colors border",
                    statusFilter === s
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", STAGE_DOT[s] ?? "bg-primary")} />
                  {stageLabel(s)}
                </button>
              ))}
            </div>
            {selectedTotal && (
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <span className="text-xs font-medium text-foreground/80 flex items-center gap-xs">
                  <span className={cn("w-2 h-2 rounded-full", STAGE_DOT[statusFilter!] ?? "bg-primary")} />
                  Total in {stageLabel(statusFilter)}
                  {statusFilter === currentStage && (
                    <span className="text-xs text-primary">(ongoing)</span>
                  )}
                </span>
                <span className="text-s font-semibold font-mono tabular-nums text-primary">
                  {formatDuration(selectedTotal.ms)}
                  <span className="text-xs font-normal text-muted-foreground ms-1.5">
                    · {selectedTotal.visits} {selectedTotal.visits === 1 ? "visit" : "visits"}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-0">
                {/* Current stage (ongoing) */}
                {showCurrentStage && (
                  <div className="relative flex gap-3 py-2">
                    <div className="relative z-10 mt-0.5 shrink-0">
                      <span className={cn("block w-[18px] h-[18px] rounded-full ring-2 ring-card", STAGE_DOT[currentStage!] ?? "bg-primary")}>
                        <span className={cn("block w-full h-full rounded-full animate-ping opacity-40", STAGE_DOT[currentStage!] ?? "bg-primary")} />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-s font-medium text-foreground leading-snug">
                        Currently in {stageLabel(currentStage)}
                      </p>
                      <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDuration(currentStageMs)} · ongoing
                      </span>
                    </div>
                  </div>
                )}

                {visibleItems.length === 0 && !showCurrentStage && (
                  <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
                    <History className="w-6 h-6 text-muted-foreground opacity-40" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground/60">Nothing to show</p>
                  </div>
                )}

                {visibleItems.map((it) =>
                  it.isComment && it.comment ? (
                    <CommentRow key={it.key} comment={it.comment} />
                  ) : it.activity ? (
                    <ActivityRow key={it.key} activity={it.activity} durationMs={it.durationMs} durationStage={it.durationStage ?? null} />
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ActivityRow({
  activity,
  durationMs,
  durationStage,
}: {
  activity: Activity;
  durationMs?: number;
  durationStage: string | null;
}) {
  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative z-10 mt-1 shrink-0">
        <Avatar user={activity.user} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-s text-foreground/80 leading-snug">{describeActivity(activity)}</p>
        <div className="flex items-center gap-xs mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground/50 me-0.5">{timeAgo(activity.createdAt)}</span>
          {durationMs !== undefined && durationStage && (
            <>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium border tabular-nums", stageBadgeClass(durationStage))}>
                <Clock className="w-2.5 h-2.5" />
                {formatDuration(durationMs)}
              </span>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium border", stageBadgeClass(durationStage))}>
                <span className={cn("w-1.5 h-1.5 rounded-full", STAGE_DOT[durationStage] ?? "bg-current")} />
                {stageLabel(durationStage)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentRow({ comment }: { comment: Comment }) {
  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative z-10 mt-1 shrink-0">
        <Avatar user={comment.user} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-s font-semibold text-foreground/90">{comment.user.name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground/50">commented</span>
          <span className="text-xs text-muted-foreground/50">· {timeAgo(comment.createdAt)}</span>
        </div>
        <div className="mt-1 rounded-lg border border-border/60 bg-background px-2.5 py-2">
          <p className="text-s text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
            {comment.content}
          </p>
          {comment.attachments && comment.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-xs">
              {comment.attachments.map((a) =>
                a.mimeType && IMAGE_TYPES.includes(a.mimeType) ? (
                  <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="rounded-md overflow-hidden border border-border hover:border-primary/50 transition-colors">
                    <img src={a.url} alt={a.filename} className="w-14 h-14 object-cover" />
                  </a>
                ) : (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-xs rounded-md border border-border bg-muted/30 px-2 py-1.5 hover:border-primary/50 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground/70 truncate max-w-[120px]">{a.filename}</span>
                    {a.fileSize && <span className="text-xs text-muted-foreground/50 shrink-0">{formatFileSize(a.fileSize)}</span>}
                    <Download className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  </a>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
