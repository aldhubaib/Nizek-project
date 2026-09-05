export function taskTypePrefix(taskType: string): string {
  switch (taskType) {
    case "BUG":
      return "B";
    case "REPORTED_BUG":
      return "RB";
    case "ENHANCEMENT":
      return "E";
    case "DESIGN":
      return "D";
    default:
      return "F";
  }
}

export function taskCode(taskType: string, taskNumber: number): string {
  return `${taskTypePrefix(taskType)}-${String(taskNumber).padStart(3, "0")}`;
}

/**
 * The one status chip: a flat page-black fill, a faint border in the status
 * hue, and the label itself carrying the colour.
 *
 * The fill is `bg-background` rather than transparent so a chip reads the same
 * on a card, on a hovered row and on the page — a transparent chip picks up
 * whatever is behind it and the tint shifts under the cursor.
 */
export function outlineBadge(label: string, color: string, border: string) {
  return { label, color, bg: `bg-background ${border}` };
}

/** The chat activity cards tint their whole surface, not just an icon. */
interface ActivityPalette {
  accent: string;
  border: string;
  ring: string;
  iconWrap: string;
  button: string;
  pill: string;
  quote: string;
}

interface TypePalette {
  /** The icon, and the type's name beside it. */
  text: string;
  /** Hairline on a badge or card carrying the type. */
  border: string;
  /** A type picker's chosen option. */
  active: string;
  activity: ActivityPalette;
}

/**
 * Every task type colour in the product, and the only place any of them is set
 * — the same arrangement the statuses above have.
 *
 * Seven files used to answer this question separately and two of them had
 * drifted, so a bug was orange in chat and red on the task it linked to. The
 * classes are spelled out for the reason STATUS_COLOR spells its own out:
 * Tailwind only emits what it can read as literal text.
 */
export const TASK_TYPE_COLOR: Record<string, TypePalette> = {
  FEATURE: {
    text: "text-primary",
    border: "border-primary/30",
    active: "bg-primary/15 border-primary/40 text-primary",
    activity: {
      accent: "text-primary",
      border: "border-primary/30",
      ring: "ring-primary/15",
      iconWrap: "bg-primary/10 text-primary",
      button: "border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary",
      pill: "border-primary/30 text-primary",
      quote: "border-primary/60",
    },
  },
  ENHANCEMENT: {
    text: "text-violet",
    border: "border-violet/30",
    active: "bg-violet/15 border-violet/40 text-violet",
    activity: {
      accent: "text-violet",
      border: "border-violet/35",
      ring: "ring-violet/20",
      iconWrap: "bg-violet/10 text-violet",
      button: "border-violet/30 bg-violet/5 hover:bg-violet/10 text-violet",
      pill: "border-violet/30 text-violet",
      quote: "border-violet/60",
    },
  },
  BUG: {
    text: "text-orange",
    border: "border-orange/30",
    active: "bg-orange/15 border-orange/40 text-orange",
    activity: {
      accent: "text-orange",
      border: "border-orange/35",
      ring: "ring-orange/20",
      iconWrap: "bg-orange/10 text-orange",
      button: "border-orange/30 bg-orange/5 hover:bg-orange/10 text-orange",
      pill: "border-orange/30 text-orange",
      quote: "border-orange/60",
    },
  },
  REPORTED_BUG: {
    text: "text-destructive",
    border: "border-destructive/30",
    active: "bg-destructive/15 border-destructive/40 text-destructive",
    activity: {
      accent: "text-destructive",
      border: "border-destructive/35",
      ring: "ring-destructive/20",
      iconWrap: "bg-destructive/10 text-destructive",
      button: "border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive",
      pill: "border-destructive/30 text-destructive",
      quote: "border-destructive/60",
    },
  },
  DESIGN: {
    text: "text-cyan",
    border: "border-cyan/30",
    active: "bg-cyan/15 border-cyan/40 text-cyan",
    activity: {
      accent: "text-cyan",
      border: "border-cyan/35",
      ring: "ring-cyan/20",
      iconWrap: "bg-cyan/10 text-cyan",
      button: "border-cyan/30 bg-cyan/5 hover:bg-cyan/10 text-cyan",
      pill: "border-cyan/30 text-cyan",
      quote: "border-cyan/60",
    },
  },
};

/** Unknown types read as a business case, the type everything else defaults to. */
export function taskTypeColor(taskType: string): TypePalette {
  return TASK_TYPE_COLOR[taskType] ?? TASK_TYPE_COLOR.FEATURE;
}

/**
 * Internal wording. "Internal Bug" is the team's name for a bug they found
 * themselves, against the one a client reported; clients see plainer names,
 * set in note-activity-payload.
 */
export const TASK_TYPE_LABEL: Record<string, string> = {
  FEATURE: "Business Case",
  ENHANCEMENT: "Enhancement",
  BUG: "Internal Bug",
  REPORTED_BUG: "Reported Bug",
  DESIGN: "Design",
};

export function taskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABEL[taskType] ?? taskType;
}

function typeBadge(taskType: string, label: string) {
  const palette = taskTypeColor(taskType);
  return outlineBadge(label, palette.text, palette.border);
}

export const TASK_TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  FEATURE: typeBadge("FEATURE", "Business Case"),
  ENHANCEMENT: typeBadge("ENHANCEMENT", "Enhancement"),
  BUG: typeBadge("BUG", "Bug"),
  REPORTED_BUG: typeBadge("REPORTED_BUG", "Reported Bug"),
  DESIGN: typeBadge("DESIGN", "Design"),
};

interface StatusPalette {
  /** Filled dot, for column headers and badge bullets. */
  dot: string;
  text: string;
  border: string;
}

/**
 * Every status colour in the product, and the only place any of them is set.
 * The board columns, the roadmap columns and the badges all read from here, so
 * recolouring a column recolours its badge with it — there is no second list to
 * remember.
 *
 * Each entry spells its three classes out instead of interpolating one stem
 * because Tailwind only emits classes it can find as literal text; a computed
 * `bg-${hue}` compiles to nothing at all. Editing a status is still a one-line
 * change here.
 *
 * The hues are deliberately spread so that no two statuses appearing side by
 * side land on the same colour — Backlog and Planned used to share a grey, and
 * Done, Completed and Shipped all shared a green.
 */
export const STATUS_COLOR: Record<string, StatusPalette> = {
  BACKLOG: { dot: "bg-muted-foreground", text: "text-muted-foreground", border: "border-muted-foreground/30" },
  PLANNED: { dot: "bg-violet", text: "text-violet", border: "border-violet/30" },
  NEXT: { dot: "bg-fuchsia-400", text: "text-fuchsia-400", border: "border-fuchsia-400/30" },
  TODO: { dot: "bg-cyan", text: "text-cyan", border: "border-cyan/30" },
  IN_DEVELOPMENT: { dot: "bg-primary", text: "text-primary", border: "border-primary/30" },
  INTERNAL_REVIEW: { dot: "bg-orange", text: "text-orange", border: "border-orange/30" },
  DONE: { dot: "bg-emerald-400", text: "text-emerald-400", border: "border-emerald-400/30" },
  COMPLETED: { dot: "bg-success", text: "text-success", border: "border-success/30" },
  SHIPPED: { dot: "bg-lime-400", text: "text-lime-400", border: "border-lime-400/30" },
  /** Sprint-only. An active sprint hands its tasks over to the work stages. */
  ACTIVE: { dot: "bg-sky", text: "text-sky", border: "border-sky/30" },
  /** Sprint-only. Closed with work left over, so it reads as a warning. */
  PARTIALLY_COMPLETED: { dot: "bg-rose-400", text: "text-rose-400", border: "border-rose-400/30" },
  /** Not a stage — the roadmap's holding pen for unanswered mandatory questions. */
  MISSING_DATA: { dot: "bg-amber-400", text: "text-amber-400", border: "border-amber-400/30" },
};

const UNKNOWN_STATUS: StatusPalette = {
  dot: "bg-muted-foreground",
  text: "text-muted-foreground",
  border: "border-border",
};

export function statusColor(status: string): StatusPalette {
  return STATUS_COLOR[status] ?? UNKNOWN_STATUS;
}

/** Header dot for a status. Board and roadmap columns both read this. */
export function statusDot(status: string): string {
  return statusColor(status).dot;
}

function statusBadge(status: string, label: string) {
  const palette = statusColor(status);
  return outlineBadge(label, palette.text, palette.border);
}

// Declaration order is the lifecycle order, and the history view relies on it to
// lay stages out left to right.
export const TASK_STAGE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  BACKLOG: statusBadge("BACKLOG", "Backlog"),
  PLANNED: statusBadge("PLANNED", "Planned"),
  NEXT: statusBadge("NEXT", "Next"),
  TODO: statusBadge("TODO", "Todo"),
  IN_DEVELOPMENT: statusBadge("IN_DEVELOPMENT", "In Development"),
  INTERNAL_REVIEW: statusBadge("INTERNAL_REVIEW", "Internal Review"),
  DONE: statusBadge("DONE", "Done"),
  COMPLETED: statusBadge("COMPLETED", "Completed"),
  SHIPPED: statusBadge("SHIPPED", "Shipped"),
};

export const TASK_STAGE_DOT: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_COLOR).map(([status, palette]) => [status, palette.dot]),
);

export function taskStageBadge(stage: string, missingData = false) {
  if (missingData) {
    return outlineBadge("Missing data", "text-orange", "border-orange/30");
  }
  return (
    TASK_STAGE_BADGE[stage] ??
    outlineBadge(stage, "text-muted-foreground", "border-muted-foreground/30")
  );
}

export function stageLabel(stage: string | null | undefined, missingData = false): string {
  if (!stage) return "—";
  return taskStageBadge(stage, missingData).label;
}

/** Lowest to highest. Order is the ranking, and the pickers render it as-is. */
export const TASK_PRIORITIES = [
  "VERY_LOW",
  "LOW",
  "NORMAL",
  "HIGH",
  "VERY_HIGH",
] as const;

export type TaskPriorityId = (typeof TASK_PRIORITIES)[number];

/** Every task starts here — there is no "unset" priority. */
export const DEFAULT_TASK_PRIORITY: TaskPriorityId = "NORMAL";

export const TASK_PRIORITY_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  VERY_LOW: outlineBadge("Very Low", "text-muted-foreground", "border-muted-foreground/30"),
  LOW: outlineBadge("Low", "text-cyan", "border-cyan/30"),
  NORMAL: outlineBadge("Normal", "text-primary", "border-primary/30"),
  HIGH: outlineBadge("High", "text-orange", "border-orange/30"),
  VERY_HIGH: outlineBadge("Very High", "text-destructive", "border-destructive/30"),
};

export function isTaskPriority(value: unknown): value is TaskPriorityId {
  return (
    typeof value === "string" &&
    (TASK_PRIORITIES as readonly string[]).includes(value)
  );
}

export function taskPriorityBadge(priority: string | null | undefined) {
  if (!priority) return TASK_PRIORITY_BADGE[DEFAULT_TASK_PRIORITY];
  return (
    TASK_PRIORITY_BADGE[priority] ??
    outlineBadge(priority, "text-muted-foreground", "border-muted-foreground/30")
  );
}

/**
 * Task history predates the named levels, so old rows hold "7" and the like.
 * Those stay as written rather than being reinterpreted after the fact.
 */
export function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "—";
  return TASK_PRIORITY_BADGE[priority]?.label ?? priority;
}

// Same palette as the task stages: a sprint and the tasks it holds share these
// names, so they had better share the colour too.
export const SPRINT_STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PLANNED: statusBadge("PLANNED", "Planned"),
  NEXT: statusBadge("NEXT", "Next"),
  ACTIVE: statusBadge("ACTIVE", "In progress"),
  COMPLETED: statusBadge("COMPLETED", "Completed"),
  PARTIALLY_COMPLETED: statusBadge("PARTIALLY_COMPLETED", "Partially completed"),
  SHIPPED: statusBadge("SHIPPED", "Shipped"),
};

export function sprintStatusBadge(status: string) {
  return (
    SPRINT_STATUS_BADGE[status] ??
    outlineBadge(status, "text-muted-foreground", "border-border")
  );
}

export function sprintTabForStatus(status: string): "sprints" | "roadmap" {
  if (status === "ACTIVE") return "sprints";
  return "roadmap";
}

export function normalizeProjectTab(tab: string | null | undefined): string {
  if (!tab || tab === "board" || tab === "completed") return "roadmap";
  return tab;
}

export function isProjectReturnTab(
  value: string | null | undefined,
): value is "board" | "sprints" | "roadmap" | "completed" {
  return (
    value === "board" ||
    value === "sprints" ||
    value === "roadmap" ||
    value === "completed"
  );
}

/** Task details URL, carrying the project tab to return to. */
export function taskDetailHref(
  projectId: string,
  taskId: string,
  from?: string | null,
): string {
  const base = `/dashboard/projects/${projectId}/tasks/${taskId}`;
  if (isProjectReturnTab(from)) return `${base}?from=${from}`;
  return base;
}

/** Project page to return to from task details. */
export function projectHrefForTaskReturn(
  projectId: string,
  from?: string | null,
  sprintStatus?: string | null,
): string {
  const tab = isProjectReturnTab(from)
    ? from === "completed" || from === "board"
      ? "roadmap"
      : from
    : sprintStatus
      ? sprintTabForStatus(sprintStatus)
      : "roadmap";
  if (tab === "roadmap") return `/dashboard/projects/${projectId}`;
  return `/dashboard/projects/${projectId}?tab=${tab}`;
}

