export type SprintPlanningInfo = {
  sprintId: string;
  sprintName?: string;
  status?: string;
  documentDate: string;
  documentDateIso: string;
  /**
   * When the sprint was reviewed, as opposed to when it was planned.
   *
   * The plan and the review used to be separate documents with a date each.
   * They are one document now, so it carries both dates rather than losing the
   * one it was not opened with.
   */
  reviewDate?: string;
  reviewDateIso?: string;
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
  workingDays: number | string;
  locked?: boolean;
  /** Legacy, on documents written before the plan and review became one. */
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

/**
 * A sprint document's name without the kind it used to be suffixed with, back
 * when a sprint had a planning document and a review document to tell apart.
 */
export function stripSprintDocKind(title: string): string {
  return title.replace(/\s+(planning|review)\s*$/i, "").trim();
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
  const reviewDateIso =
    raw.reviewDateIso || parsePlanningDateInput(String(raw.reviewDate ?? ""));
  return {
    sprintId: raw.sprintId ?? "",
    sprintName: raw.sprintName ?? "",
    status: raw.status ?? "",
    documentDate: raw.documentDate ?? "",
    documentDateIso,
    reviewDate: raw.reviewDate ?? "",
    reviewDateIso,
    startDate: raw.startDate ?? "",
    endDate: raw.endDate ?? "",
    startIso,
    endIso,
    workingDays: raw.workingDays ?? "",
    locked: raw.locked ?? false,
    variant: raw.variant === "review" ? "review" : "planning",
  };
}

export function planningInfoFromHtml(html: string): SprintPlanningInfo | null {
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

/** Rewrite the sprint information node's data, leaving the rest of the document. */
export function withPlanningInfo(
  html: string,
  patch: Partial<SprintPlanningInfo>,
): string {
  const current = planningInfoFromHtml(html);
  if (!current) return html;
  const next = { ...current, ...patch };
  return html.replace(
    /\sdata-info="[^"]*"/i,
    ` data-info="${escapeHtml(JSON.stringify(next))}"`,
  );
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

/**
 * The proof that carried a task through internal review, shown on its card in
 * the sprint document.
 *
 * The team already records this the moment work is submitted, so the document
 * reports it rather than asking anybody to describe the same work twice. Dates
 * are ISO strings because this crosses into the editor's node options, which
 * are serialised.
 */
export type SprintTaskProof = {
  id: string;
  capturedAtIso: string;
  /** Dated with the proof, not the upload: they are the same submission. */
  videos: {
    id: string;
    filename: string;
    url: string;
    fileSize: number | null;
    createdAt: string;
  }[];
  /**
   * Set when the proof requirement was waived instead of met, which leaves a
   * proof with no videos in it. A card that showed nothing here would read as
   * though no proof was ever asked for.
   */
  bypassedByName?: string | null;
  bypassedAtIso?: string | null;
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
  /** Why it was pulled into a sprint already running. Only set when unplanned. */
  unplannedReason?: string | null;
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

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The inverse of escapeHtml, for reading a value back out of an attribute. */
export function unescapeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

/**
 * Null the assignee on every sprint-task node, leaving the rest of the document
 * alone.
 *
 * A saved sprint document carries whoever was on each task at the time, baked
 * into the node's JSON. Clients are not allowed to see real staff names — that
 * is the whole point of the alias mechanism — and hiding the avatar in the UI
 * does nothing about the name sitting in the HTML the browser was sent. This
 * runs before the document leaves the server.
 *
 * Deliberately not `overlayPlanningTaskAssignees(html, [])`: that treats an
 * absent task as departed and wipes its estimate too, and the client is
 * supposed to see estimates.
 */
export function stripPlanningTaskAssignees(html: string): string {
  return html.replace(SPRINT_TASK_TAG_RE, (tag) => {
    const taskMatch = tag.match(/\sdata-task="([^"]*)"/i);
    if (!taskMatch) return tag;
    try {
      const task = JSON.parse(unescapeAttr(taskMatch[1])) as SprintPlanningTask;
      if (!task.assignee) return tag;
      const next = { ...task, assignee: null };
      return tag.replace(
        /\sdata-task="[^"]*"/i,
        ` data-task="${escapeHtml(JSON.stringify(next))}"`,
      );
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

/**
 * The tasks a planning document committed to, read back out of its own nodes.
 *
 * A task dropped from the sprint after it started is gone from the database's
 * idea of the sprint, so the document is the only place left that remembers it
 * was ever promised. That is what makes this worth parsing rather than querying.
 */
export function planningTasksFromHtml(html: string): SprintPlanningTask[] {
  const byId = new Map<string, SprintPlanningTask>();
  for (const tag of html.match(SPRINT_TASK_TAG_RE) ?? []) {
    const taskMatch = tag.match(/\sdata-task="([^"]*)"/i);
    if (!taskMatch) continue;
    try {
      const task = JSON.parse(unescapeAttr(taskMatch[1])) as SprintPlanningTask;
      // A duplicated block is one promise, not two.
      if (task?.id && !byId.has(task.id)) byId.set(task.id, task);
    } catch {
      /* Unreadable node: skip it rather than report a phantom change. */
    }
  }
  return [...byId.values()];
}

/**
 * Remove the whole "List of Sprint Items" section: heading, blurb and rows.
 *
 * Used when the sprint starts and the outcome takes over listing the tasks.
 * Anything else somebody typed into the plan is left where it is.
 */
export function stripSprintItemList(html: string): string {
  return html
    .replace(
      // Attributes allowed: the heading has been through the editor, which does
      // not always hand back the tag exactly as it was written.
      /<h2[^>]*>\s*List of Sprint Items\s*<\/h2>\s*(?:<p[^>]*>[\s\S]*?<\/p>)?/i,
      "",
    )
    .replace(SPRINT_TASK_BLOCK_RE, "")
    .replace(EMPTY_SPRINT_TASKS_HTML, "");
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
    variant?: "planning" | "completed" | "incomplete" | "removed";
    showQuestions?: boolean;
    incompleteReason?: string;
    description?: string;
    descriptionImages?: string[];
    movedTo?: string | null;
  },
): string {
  const variant = options?.variant ?? "planning";
  const showQuestions = options?.showQuestions ?? true;
  const reason = options?.incompleteReason ?? "";
  const description = options?.description ?? "";
  const images = options?.descriptionImages ?? [];
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
    variant === "incomplete" || variant === "removed"
      ? `data-incomplete-reason="${escapeHtml(reason)}"`
      : "",
    variant === "removed" && options?.movedTo
      ? `data-moved-to="${escapeHtml(options.movedTo)}"`
      : "",
    variant === "completed" && description
      ? `data-description="${escapeHtml(description)}"`
      : "",
    variant === "completed" && images.length > 0
      ? `data-description-images="${escapeHtml(JSON.stringify(images))}"`
      : "",
    `data-decision="${escapeHtml(task.decision ?? "")}"`,
    `data-risk="${escapeHtml(task.risk ?? "")}"`,
  ]
    .filter(Boolean)
    .join(" ");
  // Non-empty inner HTML so consecutive atom nodes survive TipTap/DOM parsing.
  return `<div ${attrs}><br></div>`;
}

const unescapeAttr = unescapeHtml;

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
