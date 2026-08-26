export type SprintPlanningInfo = {
  sprintId: string;
  sprintName?: string;
  status?: string;
  documentDate: string;
  documentDateIso: string;
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
  workingDays: number | string;
  locked?: boolean;
  variant?: "planning" | "review";
};

export function formatPlanningDate(value: Date | string) {
  const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = iso ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function sprintPlanningIsLocked(status: string | undefined, isAdmin: boolean) {
  return Boolean(status) && status !== "PLANNED" && status !== "NEXT" && !isAdmin;
}

export function planningDateIso(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
}

export function parsePlanningDateInput(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeSprintPlanningInfo(
  raw: Partial<SprintPlanningInfo> | null | undefined,
): SprintPlanningInfo | null {
  if (!raw) return null;
  const startIso = raw.startIso || parsePlanningDateInput(String(raw.startDate ?? ""));
  const endIso = raw.endIso || parsePlanningDateInput(String(raw.endDate ?? ""));
  const documentDateIso =
    raw.documentDateIso || parsePlanningDateInput(String(raw.documentDate ?? ""));
  return {
    sprintId: raw.sprintId ?? "",
    sprintName: raw.sprintName ?? "",
    status: raw.status ?? "",
    documentDate: raw.documentDate ?? "",
    documentDateIso,
    startDate: raw.startDate ?? "",
    endDate: raw.endDate ?? "",
    startIso,
    endIso,
    workingDays: raw.workingDays ?? "",
    locked: raw.locked ?? false,
    variant: raw.variant === "review" ? "review" : "planning",
  };
}

function planningInfoFromHtml(html: string): SprintPlanningInfo | null {
  const match = html.match(/data-info="([^"]*)"/);
  if (!match) return null;
  try {
    const decoded = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    return normalizeSprintPlanningInfo(JSON.parse(decoded) as Partial<SprintPlanningInfo>);
  } catch {
    return null;
  }
}

export function documentDateIsoFromPlanningHtml(html: string): string | null {
  return planningInfoFromHtml(html)?.documentDateIso || null;
}

export function sprintIdFromPlanningHtml(html: string): string | null {
  return planningInfoFromHtml(html)?.sprintId || null;
}

export type SprintPlanningQa = {
  question: string;
  answer: string;
};

export type SprintPlanningTask = {
  id: string;
  code: string;
  title: string;
  taskType: string;
  stage: string;
  estimatedMinutes: number | null;
  sprintCount: number;
  isReadyForTransition?: boolean;
  assignee: { id?: string; name: string | null; imageUrl: string | null } | null;
  questions: SprintPlanningQa[];
  unplanned?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatPlanningAnswer(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "—";
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const parts = parsed.map((v) => String(v).trim()).filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : "—";
    }
  } catch {
    /* plain text */
  }
  return trimmed;
}

export function overlayPlanningTaskAssignees(
  html: string,
  tasks: SprintPlanningTask[],
): string {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return html.replace(/\sdata-task="([^"]*)"/g, (full, encoded: string) => {
    try {
      const task = JSON.parse(unescapeAttr(encoded)) as SprintPlanningTask;
      const live = byId.get(task.id);
      const next = {
        ...task,
        assignee: live ? live.assignee : null,
        estimatedMinutes: live ? live.estimatedMinutes : null,
        questions: live?.questions?.length ? live.questions : task.questions,
        unplanned: live?.unplanned ?? task.unplanned,
      };
      return ` data-task="${escapeHtml(JSON.stringify(next))}"`;
    } catch {
      return full;
    }
  });
}

const EMPTY_SPRINT_TASKS_HTML = `<p><em>No tasks in this sprint yet.</em></p>`;
const SPRINT_TASK_BLOCK_RE = /<div\b[^>]*data-type="sprint-task"[^>]*>[\s\S]*?<\/div>/gi;

export function planningTaskIdsFromHtml(html: string): string[] {
  const ids: string[] = [];
  const tags = html.match(/<div\b[^>]*data-type="sprint-task"[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const taskMatch = tag.match(/\sdata-task="([^"]*)"/i);
    if (!taskMatch) continue;
    try {
      const task = JSON.parse(unescapeAttr(taskMatch[1])) as { id?: string };
      if (task.id) ids.push(task.id);
    } catch {
      /* skip malformed nodes */
    }
  }
  return ids;
}

/** Keep saved planning HTML in sync with the sprint: overlay live fields and insert missing tasks. */
export function syncPlanningDocTasks(html: string, tasks: SprintPlanningTask[]): string {
  let next = overlayPlanningTaskAssignees(html, tasks);
  if (tasks.length === 0) return next;

  const existing = new Set(planningTaskIdsFromHtml(next));
  const missing = tasks.filter((task) => !existing.has(task.id));
  if (missing.length === 0) return next;

  const blocks = missing.map((task) => sprintTaskNodeHtml(task)).join("");
  if (next.includes(EMPTY_SPRINT_TASKS_HTML)) {
    return next.replace(EMPTY_SPRINT_TASKS_HTML, blocks);
  }

  const matches = [...next.matchAll(SPRINT_TASK_BLOCK_RE)];
  const last = matches.at(-1);
  if (last?.index != null) {
    const insertAt = last.index + last[0].length;
    return `${next.slice(0, insertAt)}${blocks}${next.slice(insertAt)}`;
  }

  const heading = next.search(/<h2>List of Sprint Items<\/h2>/i);
  if (heading >= 0) {
    const afterHeading = next.slice(heading);
    const paragraphEnd = afterHeading.search(/<\/p>/i);
    if (paragraphEnd >= 0) {
      const insertAt = heading + paragraphEnd + 4;
      return `${next.slice(0, insertAt)}${blocks}${next.slice(insertAt)}`;
    }
  }
  return next + blocks;
}

export function sprintTaskNodeHtml(
  task: SprintPlanningTask,
  options?: {
    variant?: "planning" | "completed" | "incomplete";
    showQuestions?: boolean;
    incompleteReason?: string;
  },
): string {
  const variant = options?.variant ?? "planning";
  const showQuestions = options?.showQuestions ?? true;
  const reason = options?.incompleteReason ?? "";
  const attrs = [
    `data-type="sprint-task"`,
    `data-id="${escapeHtml(task.id)}"`,
    `data-task="${escapeHtml(JSON.stringify(task))}"`,
    showQuestions ? `data-show-questions="true"` : "",
    variant !== "planning" ? `data-variant="${variant}"` : "",
    variant === "incomplete" ? `data-incomplete-reason="${escapeHtml(reason)}"` : "",
    `data-decision=""`,
    `data-risk=""`,
  ]
    .filter(Boolean)
    .join(" ");
  // Non-empty inner HTML so consecutive atom nodes survive TipTap/DOM parsing.
  return `<div ${attrs}><br></div>`;
}

function unescapeAttr(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attrMissing(tag: string, name: string): boolean {
  const match = tag.match(new RegExp(`\\sdata-${name}="([^"]*)"`, "i"));
  return !match || !unescapeAttr(match[1]).trim();
}

export function sprintPlanningTasksMissingRequired(html: string): boolean {
  const tags = html.match(/<div\b[^>]*data-type="sprint-task"[^>]*>/gi) ?? [];
  if (tags.length === 0) return false;
  return tags.some((tag) => attrMissing(tag, "decision") || attrMissing(tag, "risk"));
}

export function sprintStartBlockedReason(opts: {
  activeSprintName?: string | null;
  infoIncomplete: boolean;
  missingEstimates: boolean;
  missingAssignees: boolean;
  docIncomplete: boolean;
}): string | null {
  if (opts.activeSprintName) {
    return `Finish "${opts.activeSprintName}" before starting this sprint.`;
  }
  if (opts.infoIncomplete) return "Fill in every Sprint Information field.";
  if (opts.missingEstimates) return "Add an estimate to every task.";
  if (opts.missingAssignees) return "Assign every task.";
  if (opts.docIncomplete) return "Fill in Decision and Risk for every task.";
  return null;
}

export function sprintPlanningTasksMissingRisk(html: string): boolean {
  return sprintPlanningTasksMissingRequired(html);
}

/** New planning docs start with an empty Sprint Information table. */
export function blankPlanningSchedule(info: SprintPlanningInfo): SprintPlanningInfo {
  return {
    ...info,
    documentDate: "",
    documentDateIso: "",
    startDate: "",
    endDate: "",
    startIso: "",
    endIso: "",
    workingDays: "",
  };
}

export function sprintInfoNodeHtml(info: SprintPlanningInfo): string {
  return `<div data-type="sprint-info" data-info="${escapeHtml(JSON.stringify(info))}"></div>`;
}

export function sprintPlanningDocHtml(
  tasks: SprintPlanningTask[],
  info: SprintPlanningInfo,
): string {
  const taskBlocks =
    tasks.length === 0
      ? EMPTY_SPRINT_TASKS_HTML
      : tasks.map((task) => sprintTaskNodeHtml(task)).join("");

  return [
    sprintInfoNodeHtml(info),
    `<h2>Introduction</h2>`,
    `<p>This sprint outlines the development work planned for the upcoming iteration. It serves as a shared commitment between all stakeholders, ensuring the team is aligned on the agreed objectives, priorities, and expected deliverables for the sprint.</p>`,
    `<h2>List of Sprint Items</h2>`,
    `<p>Below is the list of development items that have been reviewed, prioritized, and agreed upon by the team for this sprint. These items represent the scope of work to be completed during the sprint and will be tracked throughout the development cycle.</p>`,
    taskBlocks,
  ].join("");
}
