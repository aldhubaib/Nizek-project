"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  AlertTriangle,
  XCircle,
  CalendarClock,
  Clock,
  MessageCircleQuestion,
  ShieldCheck,
  SkipForward,
  UserX,
  History,
  RotateCcw,
  Send,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatStageHours, FLAG_LABELS, type AuditFlagType } from "@/lib/audit-flags";
import {
  getBlameCandidates,
  setAuditItemVerdict,
  submitAuditReport,
  type AuditReportDTO,
  type AuditItemDTO,
  type BlameCandidatesDTO,
} from "@/actions/audit";

const FLAG_STYLE: Record<
  string,
  { icon: LucideIcon; color: string; chip: string }
> = {
  critical_late: {
    icon: AlertTriangle,
    color: "text-destructive",
    chip: "border-destructive/20 bg-destructive/10 text-destructive",
  },
  rejected: {
    icon: XCircle,
    color: "text-orange-400",
    chip: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  },
  deadline_overdue: {
    icon: CalendarClock,
    color: "text-destructive",
    chip: "border-destructive/20 bg-destructive/10 text-destructive",
  },
  warn_late: {
    icon: Clock,
    color: "text-orange",
    chip: "border-orange/20 bg-orange/10 text-orange",
  },
  client_input: {
    icon: MessageCircleQuestion,
    color: "text-sky-400",
    chip: "border-sky-500/20 bg-sky-500/10 text-sky-400",
  },
};

export function ReportClient({ report }: { report: AuditReportDTO }) {
  const router = useRouter();
  const [items, setItems] = useState<AuditItemDTO[]>(report.items);
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const locked = report.status !== "draft" || !report.isOwner;
  const decided = items.filter((i) => i.verdict !== "pending").length;
  const allDecided = decided === items.length;

  const handleSubmit = () => {
    setSubmitError(null);
    startSubmit(async () => {
      const res = await submitAuditReport(report.id);
      if (!res.ok) setSubmitError(res.error ?? "Failed to submit");
      else router.refresh();
    });
  };

  return (
    <div>
      <PageHeader className="justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard/audit"
            className="flex shrink-0 items-center gap-xs text-s text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Reports
          </Link>
          <span className="text-border">|</span>
          <h1 className="truncate text-s font-semibold">
            {format(new Date(report.auditDate), "EEEE, MMM d, yyyy")}
          </h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {report.teamNames.join(", ")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {decided}/{items.length} reviewed
          </span>
          {report.status === "submitted" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
              <ShieldCheck className="h-3 w-3" />
              Submitted
            </span>
          ) : report.isOwner ? (
            <Button
              size="sm"
              className="h-8 gap-xs"
              disabled={submitting}
              onClick={handleSubmit}
              title={
                allDecided
                  ? "Lock this report"
                  : "You can submit with pending items — they count as skipped follow-ups"
              }
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? "Submitting…" : "Submit report"}
            </Button>
          ) : null}
        </div>
      </PageHeader>

      {submitError && (
        <p className="px-app pt-3 text-s text-destructive">{submitError}</p>
      )}

      <div className="space-y-3 px-app py-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="mb-2 h-8 w-8 text-success/40" />
            <p className="text-s text-muted-foreground">
              Nothing flagged for the selected teams — clean day.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <AuditItemCard
              key={item.id}
              item={item}
              locked={locked}
              onChange={(updated) =>
                setItems((prev) =>
                  prev.map((i) => (i.id === updated.id ? updated : i)),
                )
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Item card ──────────────────────────────────────────

function AuditItemCard({
  item,
  locked,
  onChange,
}: {
  item: AuditItemDTO;
  locked: boolean;
  onChange: (item: AuditItemDTO) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [candidates, setCandidates] = useState<BlameCandidatesDTO | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [note, setNote] = useState(item.reasonNote ?? "");
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const style = FLAG_STYLE[item.flagType] ?? FLAG_STYLE.warn_late;
  const FlagIcon = style.icon;

  const toggleExpanded = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !candidates && !loadingCandidates) {
      setLoadingCandidates(true);
      try {
        setCandidates(
          await getBlameCandidates({ taskId: item.taskId, noteId: item.noteId }),
        );
      } finally {
        setLoadingCandidates(false);
      }
    }
  };

  const applyVerdict = (
    verdict: "blamed" | "excused" | "skipped" | "pending",
    blamedUserId?: string | null,
    blamedUser?: AuditItemDTO["blamedUser"],
  ) => {
    setError(null);
    startSaving(async () => {
      const res = await setAuditItemVerdict(item.id, {
        verdict,
        blamedUserId,
        reasonNote: note,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to save");
        return;
      }
      onChange({
        ...item,
        verdict,
        blamedUser: verdict === "blamed" ? (blamedUser ?? null) : null,
        reasonNote: note.trim() || null,
      });
    });
  };

  const linkHref = item.taskId
    ? `/dashboard/projects/${item.projectId}/tasks/${item.taskId}`
    : `/dashboard/projects/${item.projectId}?tab=notes`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors",
        item.verdict === "pending" ? "border-border" : "border-border/50 opacity-90",
      )}
    >
      {/* Row header */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-accent/10"
      >
        <FlagIcon className={cn("h-4 w-4 shrink-0", style.color)} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-s font-medium">
            {item.taskNumber != null && (
              <span className="text-muted-foreground">#{item.taskNumber} </span>
            )}
            {item.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {item.projectName}
            {item.teamName ? ` · ${item.teamName}` : ""}
            {item.stageLabel ? ` · ${item.stageLabel}` : ""}
            {item.assigneeName ? ` · ${item.assigneeName}` : " · Unassigned"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {item.carriedOver && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              title="Already reviewed in an earlier report — still unresolved"
            >
              <RotateCcw className="h-3 w-3" />
              Carried over
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
              style.chip,
            )}
          >
            {FLAG_LABELS[item.flagType as AuditFlagType] ?? item.flagType}
            {item.stageHours != null && ` · ${formatStageHours(item.stageHours)}`}
            {item.declineCount != null && ` · ${item.declineCount}×`}
            {item.dueInDays != null && ` · ${Math.abs(item.dueInDays)}d overdue`}
          </span>
          <VerdictBadge item={item} />
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground/50 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {/* Expanded verdict panel */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-xs text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Ownership history
            </p>
            <Link
              href={linkHref}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Open {item.taskId ? "task" : "note"}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {loadingCandidates ? (
            <p className="py-2 text-s text-muted-foreground">Loading history…</p>
          ) : candidates && candidates.timeline.length > 0 ? (
            <div className="mb-4 max-h-48 space-y-1.5 overflow-y-auto pe-1">
              {candidates.timeline.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-s">
                  <Avatar className="h-5 w-5 shrink-0">
                    <AvatarImage src={e.imageUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {(e.userName ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{e.userName ?? "Unknown"}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {e.label}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground/70">
                    {format(new Date(e.at), "MMM d")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 py-2 text-s text-muted-foreground">
              No ownership history recorded.
            </p>
          )}

          {!locked && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Who is responsible for this delay?
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {(candidates?.candidates ?? []).map((c) => {
                  const isBlamed =
                    item.verdict === "blamed" && item.blamedUser?.id === c.userId;
                  return (
                    <button
                      key={c.userId}
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        applyVerdict("blamed", c.userId, {
                          id: c.userId,
                          name: c.userName,
                          imageUrl: c.imageUrl ?? null,
                        })
                      }
                      className={cn(
                        "flex items-center gap-xs rounded-full border px-2.5 py-1 text-s transition-colors",
                        isBlamed
                          ? "border-destructive/40 bg-destructive/15 text-destructive"
                          : "border-border bg-card text-foreground hover:bg-accent/20",
                      )}
                    >
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={c.imageUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {(c.userName ?? "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {c.userName ?? "Unknown"}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => applyVerdict("excused")}
                  className={cn(
                    "flex items-center gap-xs rounded-full border px-2.5 py-1 text-s transition-colors",
                    item.verdict === "excused"
                      ? "border-success/40 bg-success/15 text-success"
                      : "border-border bg-card text-foreground hover:bg-accent/20",
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Excused
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => applyVerdict("skipped")}
                  className={cn(
                    "flex items-center gap-xs rounded-full border px-2.5 py-1 text-s transition-colors",
                    item.verdict === "skipped"
                      ? "border-border bg-muted text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent/20",
                  )}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip
                </button>
                {item.verdict !== "pending" && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => applyVerdict("pending")}
                    className="flex items-center gap-xs rounded-full border border-border bg-card px-2.5 py-1 text-s text-muted-foreground transition-colors hover:bg-accent/20"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                )}
              </div>

              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note (context, agreed follow-up…)"
                className="min-h-[60px] text-s"
              />
              {error && <p className="mt-2 text-s text-destructive">{error}</p>}
            </>
          )}

          {locked && item.reasonNote && (
            <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-s text-muted-foreground">
              {item.reasonNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function VerdictBadge({ item }: { item: AuditItemDTO }) {
  if (item.verdict === "blamed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        <UserX className="h-3 w-3" />
        {item.blamedUser?.name ?? "Blamed"}
      </span>
    );
  }
  if (item.verdict === "excused") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
        <ShieldCheck className="h-3 w-3" />
        Excused
      </span>
    );
  }
  if (item.verdict === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        <SkipForward className="h-3 w-3" />
        Skipped
      </span>
    );
  }
  return null;
}
