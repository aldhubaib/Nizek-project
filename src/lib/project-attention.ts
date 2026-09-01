// Decision logic for the manager overview: which projects need attention, and
// in what order. Kept free of Prisma/React so it is unit-testable, the same way
// audit-flags.ts is.
//
// Progress is counted in tasks, never in hours. A sprint's promise is the set of
// tasks it started with; anything added afterwards is tracked separately so the
// promise and what happened to it stay distinguishable.

import { CRITICAL_LATE_MS } from "@/lib/audit-flags";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A project with no sprint in flight this long has stopped being planned. */
export const NO_SPRINT_GAP_DAYS = 3;

/** No task has moved in this long — the project is drifting, sprint or not. */
export const QUIET_DAYS = 3;

/** A planned sprint whose start date passed this long ago never started. */
export const UNSTARTED_SPRINT_DAYS = 3;

/**
 * How far completion may trail the calendar before a sprint reads as at risk.
 * A sprint 60% through its days with 40% of its tasks done is still fine; the
 * same sprint at 20% done is not. Tunable — this is the one number to move when
 * the feed cries wolf.
 */
export const RISK_MARGIN = 0.2;

/**
 * Days the office is closed, as `Date.getUTCDay()` values. Gaps are counted in
 * working days, otherwise every project trips the no-sprint alarm each weekend.
 * Friday and Saturday here; change these two numbers to move the weekend.
 */
export const WEEKEND_DAYS: readonly number[] = [5, 6];

// ─── Working days ───────────────────────────────────────

function dayIndex(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/**
 * Whole working days between two instants, weekends excluded. Closed-form for
 * the whole weeks so an ancient date costs the same as yesterday's.
 */
export function workingDaysBetween(fromMs: number, toMs: number): number {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  const start = dayIndex(fromMs);
  const end = dayIndex(toMs);
  if (end <= start) return 0;

  const days = end - start;
  let total = Math.floor(days / 7) * (7 - WEEKEND_DAYS.length);

  let cursor = start + Math.floor(days / 7) * 7;
  while (cursor < end) {
    if (!WEEKEND_DAYS.includes(new Date(cursor * DAY_MS).getUTCDay())) total++;
    cursor++;
  }
  return total;
}

/** Calendar days until an instant; negative once it has passed. */
export function calendarDaysUntil(target: number, now: number): number {
  return Math.ceil((target - now) / DAY_MS);
}

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ─── Sprint verdict ─────────────────────────────────────

export type SprintState = "on_track" | "at_risk" | "overdue";

export interface SprintCounts {
  /** Tasks the sprint started with — the promise. */
  committed: number;
  /** Tasks pushed in after it started. */
  added: number;
  /** Tasks finished, whether committed or added. */
  done: number;
}

export interface SprintVerdict extends SprintCounts {
  state: SprintState;
  /** Everything still unfinished, committed and added alike. */
  remaining: number;
  /** Calendar days to the end date; negative once past it. */
  daysRemaining: number;
  donePct: number;
  timePct: number;
}

export interface SprintVerdictInput extends SprintCounts {
  startDate: string | Date;
  endDate: string | Date;
}

/**
 * Whether a running sprint is going to make its end date.
 *
 * Overdue is a receipt — the date passed and work is still open. At risk is the
 * one worth acting on, because it fires while there are still days left to move
 * something. A sprint that has finished everything is never late, however long
 * it sits waiting to be closed.
 */
export function sprintVerdict(
  input: SprintVerdictInput,
  now: number,
): SprintVerdict {
  const { committed, added, done } = input;
  const total = committed + added;
  const remaining = Math.max(0, total - done);

  const start = toMs(input.startDate) ?? now;
  const end = toMs(input.endDate) ?? now;
  const duration = end - start;

  const donePct = total > 0 ? done / total : 1;
  const timePct =
    duration > 0 ? Math.min(1, Math.max(0, (now - start) / duration)) : 1;
  const daysRemaining = calendarDaysUntil(end, now);

  let state: SprintState = "on_track";
  if (remaining > 0) {
    if (now > end) state = "overdue";
    else if (donePct + RISK_MARGIN < timePct) state = "at_risk";
  }

  return {
    committed,
    added,
    done,
    remaining,
    daysRemaining,
    donePct,
    timePct,
    state,
  };
}

// ─── Attention tiers ────────────────────────────────────

/**
 * Ordered by what it costs to ignore the row today, not by how bad it looks.
 *
 * A sprint about to miss outranks one that already missed: the first is still
 * fixable this morning and the second is a conversation about what to tell the
 * client. Drift outranks both kinds of lateness because a late sprint has a team
 * already worrying about it, while a project nobody has touched in a week has
 * only the person reading this page.
 */
export type AttentionTier =
  | "recoverable"
  | "unwatched"
  | "blocked"
  | "missed"
  | "chronic";

export const TIER_RANK: Record<AttentionTier, number> = {
  recoverable: 0,
  unwatched: 1,
  blocked: 2,
  missed: 3,
  chronic: 4,
};

export const TIER_LABELS: Record<AttentionTier, string> = {
  recoverable: "Still fixable",
  unwatched: "Nobody watching",
  blocked: "Blocked outside the team",
  missed: "Already missed",
  chronic: "Chronic",
};

export type AttentionSignalType =
  | "sprint_at_risk"
  | "project_quiet"
  | "no_sprint"
  | "sprint_never_started"
  | "client_blocked"
  | "sprint_overdue"
  | "task_stuck";

const SIGNAL_TIER: Record<AttentionSignalType, AttentionTier> = {
  sprint_at_risk: "recoverable",
  project_quiet: "unwatched",
  no_sprint: "unwatched",
  sprint_never_started: "unwatched",
  client_blocked: "blocked",
  sprint_overdue: "missed",
  task_stuck: "chronic",
};

export interface AttentionSignal {
  type: AttentionSignalType;
  tier: AttentionTier;
  rank: number;
  /** Orders rows inside a tier. Higher is worse. */
  magnitude: number;
  /** Reads as a sentence, so the row needs no interpreting. */
  message: string;
}

function signal(
  type: AttentionSignalType,
  magnitude: number,
  message: string,
): AttentionSignal {
  const tier = SIGNAL_TIER[type];
  return { type, tier, rank: TIER_RANK[tier], magnitude, message };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ─── Project signals ────────────────────────────────────

export interface ProjectAttentionInput {
  /** The running sprint, with the counts that decide its verdict. */
  activeSprint: (SprintCounts & {
    name: string;
    startDate: string | Date;
    endDate: string | Date;
  }) | null;
  /** The next sprint waiting to be started, if one is queued. */
  unstartedSprint: { name: string; startDate: string | Date } | null;
  /** Last time any task on the project moved. */
  lastActivityAt: string | Date | null;
  /** When the previous sprint closed, for the planning-gap count. */
  lastSprintEndedAt: string | Date | null;
  createdAt: string | Date;
  /** Tasks waiting on a client answer past the wait threshold. Phase 2. */
  clientBlockedCount?: number;
  /** Worst single task stage duration on the project. Phase 2. */
  worstStuckMs?: number | null;
}

/**
 * Everything wrong with one project, as sentences. Empty means healthy, which is
 * the common case and the reason the feed stays short.
 */
export function projectSignals(
  input: ProjectAttentionInput,
  now: number,
): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const sprint = input.activeSprint;

  if (sprint) {
    const verdict = sprintVerdict(sprint, now);

    if (verdict.state === "at_risk") {
      const days = Math.max(0, verdict.daysRemaining);
      signals.push(
        signal(
          "sprint_at_risk",
          verdict.timePct - verdict.donePct,
          `${sprint.name} is behind — ${plural(verdict.remaining, "task")} left, ${plural(days, "day")} to go`,
        ),
      );
    }

    if (verdict.state === "overdue") {
      const over = Math.abs(verdict.daysRemaining);
      signals.push(
        signal(
          "sprint_overdue",
          over,
          `${sprint.name} ended ${plural(over, "day")} ago with ${plural(verdict.remaining, "task")} unfinished`,
        ),
      );
    }
  } else {
    // No sprint in flight. Measure the gap from the last one that closed, and
    // fall back to the project's own age so a project that has never had a
    // sprint still surfaces.
    const since =
      toMs(input.lastSprintEndedAt) ?? toMs(input.createdAt) ?? now;
    const gap = workingDaysBetween(since, now);
    if (gap >= NO_SPRINT_GAP_DAYS) {
      signals.push(
        signal("no_sprint", gap, `No sprint for ${plural(gap, "working day")}`),
      );
    }
  }

  if (input.unstartedSprint) {
    const due = toMs(input.unstartedSprint.startDate);
    if (due !== null) {
      const late = workingDaysBetween(due, now);
      if (late >= UNSTARTED_SPRINT_DAYS) {
        signals.push(
          signal(
            "sprint_never_started",
            late,
            `${input.unstartedSprint.name} was due to start ${plural(late, "working day")} ago`,
          ),
        );
      }
    }
  }

  const lastActivity = toMs(input.lastActivityAt);
  if (lastActivity !== null) {
    const quiet = workingDaysBetween(lastActivity, now);
    if (quiet >= QUIET_DAYS) {
      signals.push(
        signal(
          "project_quiet",
          quiet,
          `No task has moved in ${plural(quiet, "working day")}`,
        ),
      );
    }
  }

  const blocked = input.clientBlockedCount ?? 0;
  if (blocked > 0) {
    signals.push(
      signal(
        "client_blocked",
        blocked,
        `${plural(blocked, "task")} waiting on the client`,
      ),
    );
  }

  const stuck = input.worstStuckMs ?? 0;
  if (stuck >= CRITICAL_LATE_MS) {
    const days = Math.floor(stuck / DAY_MS);
    signals.push(
      signal(
        "task_stuck",
        days,
        `A task has sat in one stage for ${plural(days, "day")}`,
      ),
    );
  }

  return signals.sort(compareSignals);
}

/** Worst first: tier, then the biggest offender inside it. */
export function compareSignals(a: AttentionSignal, b: AttentionSignal): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return b.magnitude - a.magnitude;
}

// ─── Ordering projects ──────────────────────────────────

export interface RankedProject {
  name: string;
  signals: AttentionSignal[];
}

/**
 * A project ranks as badly as its worst signal. Healthy projects rank last so
 * the manager never scrolls past them to reach a broken one.
 */
export function projectRank(signals: AttentionSignal[]): {
  rank: number;
  magnitude: number;
} {
  if (signals.length === 0) {
    return { rank: Number.POSITIVE_INFINITY, magnitude: 0 };
  }
  return signals.reduce(
    (worst, s) =>
      s.rank < worst.rank || (s.rank === worst.rank && s.magnitude > worst.magnitude)
        ? { rank: s.rank, magnitude: s.magnitude }
        : worst,
    { rank: signals[0].rank, magnitude: signals[0].magnitude },
  );
}

export function compareProjects(a: RankedProject, b: RankedProject): number {
  const ra = projectRank(a.signals);
  const rb = projectRank(b.signals);
  if (ra.rank !== rb.rank) return ra.rank - rb.rank;
  if (ra.magnitude !== rb.magnitude) return rb.magnitude - ra.magnitude;
  return a.name.localeCompare(b.name);
}

// ─── Snoozing ───────────────────────────────────────────

/** How long a manager may park a signal for. */
export const SNOOZE_OPTIONS = [
  { days: 3, label: "3 days" },
  { days: 7, label: "A week" },
  { days: 30, label: "A month" },
] as const;

/** Long enough for a real pause, short enough that nothing hides forever. */
export const MAX_SNOOZE_DAYS = 30;

// ─── Closed-sprint outcome ──────────────────────────────

/** One `SprintTaskSnapshot` row, frozen when the sprint closed. */
export interface SnapshotRow {
  stage: string;
  unplannedInSprint: boolean;
}

export interface SprintOutcome {
  /** Tasks the sprint promised at the start. */
  committed: number;
  /** How many of that promise shipped. */
  committedDone: number;
  /** Tasks pushed in after it started. */
  added: number;
  /** Share of the promise that shipped, 0 to 1. */
  reliability: number;
}

/**
 * What a closed sprint actually delivered against what it promised.
 *
 * Reads snapshots rather than tasks because closing a sprint clears `sprintId`
 * on everything unfinished and sends it back to the backlog — the snapshot is
 * the only surviving record of what the sprint held. Added work is reported but
 * kept out of the ratio: delivering six extra tasks does not make a missed
 * commitment into a kept one.
 */
export function sprintOutcome(rows: SnapshotRow[]): SprintOutcome {
  let committed = 0;
  let committedDone = 0;
  let added = 0;

  for (const row of rows) {
    if (row.unplannedInSprint) {
      added++;
      continue;
    }
    committed++;
    if (row.stage === "DONE") committedDone++;
  }

  return {
    committed,
    committedDone,
    added,
    reliability: committed > 0 ? committedDone / committed : 1,
  };
}

// ─── Stage distribution ─────────────────────────────────

/**
 * The nine task stages folded into the four a manager actually reads.
 *
 * Backlog, Planned, Next and Todo are all "not started yet" from a delivery
 * view — the distinction between them is a planning detail. Done, Completed and
 * Shipped are all "finished"; which of the three it is depends on whether the
 * sprint has closed, which is not the task's fault.
 */
export type StageGroup = "todo" | "in_development" | "internal_review" | "done";

export const STAGE_GROUP_ORDER: StageGroup[] = [
  "todo",
  "in_development",
  "internal_review",
  "done",
];

export const STAGE_GROUP_LABELS: Record<StageGroup, string> = {
  todo: "To do",
  in_development: "In development",
  internal_review: "Internal review",
  done: "Completed",
};

const STAGE_TO_GROUP: Record<string, StageGroup> = {
  BACKLOG: "todo",
  PLANNED: "todo",
  NEXT: "todo",
  TODO: "todo",
  IN_DEVELOPMENT: "in_development",
  INTERNAL_REVIEW: "internal_review",
  DONE: "done",
  COMPLETED: "done",
  SHIPPED: "done",
};

export function stageGroup(stage: string): StageGroup {
  return STAGE_TO_GROUP[stage] ?? "todo";
}

/** Whether a stage counts as finished work. */
export function isDoneStage(stage: string): boolean {
  return stageGroup(stage) === "done";
}

export function emptyStageCounts(): Record<StageGroup, number> {
  return { todo: 0, in_development: 0, internal_review: 0, done: 0 };
}

// ─── Delivery status ────────────────────────────────────

export type DeliveryStatus = "on_track" | "at_risk" | "off_track";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  on_track: "on track",
  at_risk: "at risk",
  off_track: "off track",
};

/**
 * A project's one-word delivery verdict, folded down from its signals.
 *
 * Off track is reserved for the two tiers nothing can be done about today — a
 * date already missed, or a task stuck long enough to be a process problem.
 * Everything else still has a move available this morning, so it reads as at
 * risk rather than lost.
 *
 * Deliberately not built on `projectBucket`: that answers "what should I look
 * at first", which ranks a fixable problem above a missed one. A project that
 * has already missed a date has missed it whether or not something more urgent
 * happens to be sitting on top, so this asks whether any signal is terminal.
 */
export function deliveryStatus(signals: AttentionSignal[]): DeliveryStatus {
  if (signals.length === 0) return "on_track";
  const terminal = signals.some(
    (s) => s.tier === "missed" || s.tier === "chronic",
  );
  return terminal ? "off_track" : "at_risk";
}

// ─── Bucketing for the health chart ─────────────────────

export type HealthBucket = AttentionTier | "healthy";

export const BUCKET_ORDER: HealthBucket[] = [
  "recoverable",
  "unwatched",
  "blocked",
  "missed",
  "chronic",
  "healthy",
];

export const BUCKET_LABELS: Record<HealthBucket, string> = {
  ...TIER_LABELS,
  healthy: "Healthy",
};

/**
 * The one bucket a project belongs in: the tier of its worst signal.
 *
 * One project, one slice. Counting a project once per signal would let a single
 * quiet project with three problems outweigh three projects with one each, and
 * the chart is meant to answer "how many projects are in trouble".
 */
export function projectBucket(signals: AttentionSignal[]): HealthBucket {
  if (signals.length === 0) return "healthy";
  return signals.reduce<AttentionTier>(
    (worst, s) => (s.rank < TIER_RANK[worst] ? s.tier : worst),
    signals[0].tier,
  );
}

export interface BucketGroup<T> {
  bucket: HealthBucket;
  label: string;
  projects: T[];
}

/**
 * Every project sorted into one bucket, in severity order. Empty buckets are
 * dropped so the chart has no zero-width slices to catch a click on.
 */
export function bucketProjects<T extends RankedProject>(
  projects: T[],
): BucketGroup<T>[] {
  const byBucket = new Map<HealthBucket, T[]>();
  for (const project of projects) {
    const bucket = projectBucket(project.signals);
    const list = byBucket.get(bucket) ?? [];
    list.push(project);
    byBucket.set(bucket, list);
  }

  return BUCKET_ORDER.flatMap((bucket) => {
    const list = byBucket.get(bucket);
    if (!list || list.length === 0) return [];
    return [
      {
        bucket,
        label: BUCKET_LABELS[bucket],
        projects: [...list].sort(compareProjects),
      },
    ];
  });
}
