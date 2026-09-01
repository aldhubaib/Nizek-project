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

/** Shared stem of a sprint planning/review document title. */
export function stripSprintDocKind(title: string): string {
  return title.replace(/\s+(planning|review)\s*$/i, "").trim();
}

/** Planning title with the kind swapped, e.g. "Sprint 16 planning" → "Sprint 16 review". */
export function sprintDocTitle(name: string, kind: "planning" | "review"): string {
  const stem = stripSprintDocKind(name) || name.trim();
  return stem ? `${stem} ${kind}` : kind;
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
  /** From SprintTaskPlan, not the document. The server is the authority on both. */
  decision?: string;
  risk?: string;
};

export type SprintTaskSummary = {
  businessCases: number;
  enhancements: number;
  bugs: number;
  design: number;
  totalMinutes: number;
  taskCount: number;
  completed: number;
  uncompleted: number;
};

export function summarizeSprintTasks(
  tasks: { taskType: string; estimatedMinutes?: number | null; stage?: string }[],
): SprintTaskSummary {
  let businessCases = 0;
  let enhancements = 0;
  let bugs = 0;
  let design = 0;
  let totalMinutes = 0;
  let completed = 0;
  let uncompleted = 0;
  for (const task of tasks) {
    if (task.taskType === "FEATURE") businessCases += 1;
    else if (task.taskType === "ENHANCEMENT") enhancements += 1;
    else if (task.taskType === "BUG" || task.taskType === "REPORTED_BUG") bugs += 1;
    else if (task.taskType === "DESIGN") design += 1;
    if (task.estimatedMinutes) totalMinutes += task.estimatedMinutes;
    if (task.stage === "DONE") completed += 1;
    else if (task.stage) uncompleted += 1;
  }
  return {
    businessCases,
    enhancements,
    bugs,
    design,
    totalMinutes,
    taskCount: tasks.length,
    completed,
    uncompleted,
  };
}

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

/** Replace an attribute on an opening tag, appending it when not already there. */
function setTagAttr(tag: string, name: string, value: string): string {
  const encoded = `${name}="${escapeHtml(value)}"`;
  const existing = new RegExp(`\\s${name}="[^"]*"`, "i");
  if (existing.test(tag)) return tag.replace(existing, ` ${encoded}`);
  return tag.replace(/\s*\/?>$/, (close) => ` ${encoded}${close}`);
}

/**
 * Refresh each sprint-task node from live server data.
 *
 * Decision and Risk live in SprintTaskPlan now, so they are overlaid here too:
 * the document is a view of the server's copy rather than the other way round.
 * They are stripped from the embedded task JSON so the node carries exactly one
 * copy of each, in its own attribute.
 */
export function overlayPlanningTaskAssignees(
  html: string,
  tasks: SprintPlanningTask[],
): string {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return html.replace(SPRINT_TASK_TAG_RE, (tag) => {
    const taskMatch = tag.match(/\sdata-task="([^"]*)"/i);
    if (!taskMatch) return tag;
    try {
      const task = JSON.parse(unescapeAttr(taskMatch[1])) as SprintPlanningTask;
      const live = byId.get(task.id);
      const next = {
        ...task,
        assignee: live ? live.assignee : null,
        estimatedMinutes: live ? live.estimatedMinutes : null,
        questions: live?.questions?.length ? live.questions : task.questions,
        unplanned: live?.unplanned ?? task.unplanned,
      };
      delete next.decision;
      delete next.risk;

      let out = tag.replace(
        /\sdata-task="[^"]*"/i,
        ` data-task="${escapeHtml(JSON.stringify(next))}"`,
      );
      if (live?.decision !== undefined) out = setTagAttr(out, "data-decision", live.decision);
      if (live?.risk !== undefined) out = setTagAttr(out, "data-risk", live.risk);
      return out;
    } catch {
      return tag;
    }
  });
}

const EMPTY_SPRINT_TASKS_HTML = `<p><em>No tasks in this sprint yet.</em></p>`;
const SPRINT_TASK_BLOCK_RE = /<div\b[^>]*data-type="sprint-task"[^>]*>[\s\S]*?<\/div>/gi;
/** Opening tag only. Safe as `[^>]*` because every attribute value is escaped. */
const SPRINT_TASK_TAG_RE = /<div[^>]*data-type="sprint-task"[^>]*>/gi;

/** The task a sprint-task node refers to, from its own attribute or its JSON. */
function taskIdFromSprintTaskTag(tagOrBlock: string): string | null {
  const direct = tagOrBlock.match(/\sdata-id="([^"]*)"/i);
  if (direct && direct[1].trim()) return unescapeAttr(direct[1]).trim();
  const taskMatch = tagOrBlock.match(/\sdata-task="([^"]*)"/i);
  if (!taskMatch) return null;
  try {
    const task = JSON.parse(unescapeAttr(taskMatch[1])) as { id?: string };
    return task.id ?? null;
  } catch {
    return null;
  }
}

export function planningTaskIdsFromHtml(html: string): string[] {
  const ids: string[] = [];
  for (const tag of html.match(SPRINT_TASK_TAG_RE) ?? []) {
    const id = taskIdFromSprintTaskTag(tag);
    if (id) ids.push(id);
  }
  return ids;
}

/** Drop the blocks in `html` whose task is no longer in the sprint. */
function removeDepartedTaskBlocks(html: string, liveIds: Set<string>): string {
  return html.replace(SPRINT_TASK_BLOCK_RE, (block) => {
    const id = taskIdFromSprintTaskTag(block);
    // An unreadable node is left alone: better a stale row than silently eating
    // something we failed to parse.
    if (!id) return block;
    return liveIds.has(id) ? block : "";
  });
}

/** Put `blocks` where the sprint item list belongs. */
function insertTaskBlocks(html: string, blocks: string): string {
  if (html.includes(EMPTY_SPRINT_TASKS_HTML)) {
    return html.replace(EMPTY_SPRINT_TASKS_HTML, blocks);
  }

  const matches = [...html.matchAll(SPRINT_TASK_BLOCK_RE)];
  const last = matches.at(-1);
  if (last?.index != null) {
    const insertAt = last.index + last[0].length;
    return `${html.slice(0, insertAt)}${blocks}${html.slice(insertAt)}`;
  }

  const heading = html.search(/<h2>List of Sprint Items<\/h2>/i);
  if (heading >= 0) {
    const afterHeading = html.slice(heading);
    const paragraphEnd = afterHeading.search(/<\/p>/i);
    if (paragraphEnd >= 0) {
      const insertAt = heading + paragraphEnd + 4;
      return `${html.slice(0, insertAt)}${blocks}${html.slice(insertAt)}`;
    }
  }
  return html + blocks;
}

/**
 * Make the saved planning HTML say exactly what the sprint holds.
 *
 * Reconciles in both directions. It used to only add, so a task dragged out of
 * Next kept its row forever — and since that row has no assignee, estimate,
 * Decision or Risk, it permanently disabled the Start sprint button with a
 * complaint about a task that was no longer in the sprint.
 *
 * Callers must stop invoking this once the sprint starts; the document is the
 * record of what was committed to, not a live view.
 */
export function syncPlanningDocTasks(html: string, tasks: SprintPlanningTask[]): string {
  const liveIds = new Set(tasks.map((task) => task.id));

  let next = overlayPlanningTaskAssignees(html, tasks);
  next = removeDepartedTaskBlocks(next, liveIds);

  const existing = new Set(planningTaskIdsFromHtml(next));
  const missing = tasks.filter((task) => !existing.has(task.id));

  if (missing.length === 0) {
    // An emptied sprint gets its placeholder back, otherwise the item list is a
    // bare heading with nothing under it.
    if (existing.size === 0 && !next.includes(EMPTY_SPRINT_TASKS_HTML)) {
      return insertTaskBlocks(next, EMPTY_SPRINT_TASKS_HTML);
    }
    return next;
  }

  return insertTaskBlocks(next, missing.map((task) => sprintTaskNodeHtml(task)).join(""));
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
  // Decision and Risk ride in their own attributes, so they are dropped from the
  // embedded task JSON rather than stored twice in the same node.
  const embedded = { ...task };
  delete embedded.decision;
  delete embedded.risk;
  const attrs = [
    `data-type="sprint-task"`,
    `data-id="${escapeHtml(task.id)}"`,
    `data-task="${escapeHtml(JSON.stringify(embedded))}"`,
    showQuestions ? `data-show-questions="true"` : "",
    variant !== "planning" ? `data-variant="${variant}"` : "",
    variant === "incomplete" ? `data-incomplete-reason="${escapeHtml(reason)}"` : "",
    `data-decision="${escapeHtml(task.decision ?? "")}"`,
    `data-risk="${escapeHtml(task.risk ?? "")}"`,
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
