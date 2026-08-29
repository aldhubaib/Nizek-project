import {
  documentDateIsoFromPlanningHtml,
  formatPlanningDate,
  planningDateIso,
  sprintIdFromPlanningHtml,
  sprintInfoNodeHtml,
  sprintTaskNodeHtml,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";

function unescapeAttr(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function sprintIdFromReviewHtml(html: string): string | null {
  const match = html.match(/data-sprint-id="([^"]+)"/) || html.match(/"sprintId":"([^"]+)"/);
  return match?.[1] ?? sprintIdFromPlanningHtml(html);
}

/** Review document date keyed by sprint, newest note wins if several exist. */
export function reviewDateBySprintId(
  notes: { content: string; date?: Date | string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const note of notes) {
    const sprintId = sprintIdFromReviewHtml(note.content);
    if (!sprintId || map.has(sprintId)) continue;
    const iso =
      documentDateIsoFromPlanningHtml(note.content) ||
      (note.date ? planningDateIso(note.date) : null);
    if (iso) map.set(sprintId, iso);
  }
  return map;
}

export function incompleteReasonsFromReviewHtml(html: string): Record<string, string> {
  const reasons: Record<string, string> = {};
  const tags = html.match(/<div\b[^>]*data-type="sprint-task"[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/data-variant="incomplete"/i.test(tag)) continue;
    const taskMatch = tag.match(/\sdata-task="([^"]*)"/i);
    const reasonMatch = tag.match(/\sdata-incomplete-reason="([^"]*)"/i);
    if (!taskMatch) continue;
    try {
      const task = JSON.parse(unescapeAttr(taskMatch[1])) as { id?: string };
      const reason = unescapeAttr(reasonMatch?.[1] ?? "").trim();
      if (task.id && reason) reasons[task.id] = reason;
    } catch {
      /* skip */
    }
  }
  return reasons;
}

export function sprintReviewInfoIncomplete(html: string): boolean {
  const match = html.match(/data-info="([^"]*)"/);
  if (!match) return true;
  try {
    const info = JSON.parse(unescapeAttr(match[1])) as Partial<SprintPlanningInfo>;
    return (
      !info.documentDateIso ||
      !info.startIso ||
      !info.endIso ||
      info.workingDays === "" ||
      info.workingDays == null ||
      Number(info.workingDays) < 1
    );
  } catch {
    return true;
  }
}

export function sprintReviewMissingReasons(html: string): boolean {
  const tags = html.match(/<div\b[^>]*data-type="sprint-task"[^>]*>/gi) ?? [];
  return tags.some((tag) => {
    if (!/data-variant="incomplete"/i.test(tag)) return false;
    const reasonMatch = tag.match(/\sdata-incomplete-reason="([^"]*)"/i);
    return !reasonMatch || !unescapeAttr(reasonMatch[1]).trim();
  });
}

export function reviewInfoFromExisting(
  live: SprintPlanningInfo,
  existingHtml: string,
): SprintPlanningInfo {
  const date = documentDateIsoFromPlanningHtml(existingHtml);
  return {
    ...live,
    variant: "review",
    locked: true,
    documentDateIso: date || live.documentDateIso,
    documentDate: date ? formatPlanningDate(date) : live.documentDate,
  };
}

export function sprintReviewDocHtml(
  info: SprintPlanningInfo,
  completed: SprintPlanningTask[],
  incomplete: SprintPlanningTask[],
  reasonById: Record<string, string> = {},
): string {
  const completedBlocks =
    completed.length === 0
      ? `<p><em>No completed items in this sprint.</em></p>`
      : completed
          .map((task) => sprintTaskNodeHtml(task, { variant: "completed", showQuestions: true }))
          .join("");
  const incompleteBlocks =
    incomplete.length === 0
      ? `<p><em>No incomplete items in this sprint.</em></p>`
      : incomplete
          .map((task) =>
            sprintTaskNodeHtml(task, {
              variant: "incomplete",
              showQuestions: true,
              incompleteReason: reasonById[task.id] ?? "",
            }),
          )
          .join("");

  return [
    sprintInfoNodeHtml({ ...info, variant: "review", locked: true }),
    `<h2>Introduction</h2>`,
    `<p>This Sprint Review summarizes the work completed during the sprint and evaluates the outcomes against the planned objectives. It provides stakeholders with a clear overview of delivered features, completed tasks, outstanding items, and any challenges encountered. The purpose of this review is to ensure transparency, capture lessons learned, and align on the next steps.</p>`,
    `<h2>Completed Sprint Items</h2>`,
    `<p>The following items were successfully completed, tested, and accepted during this sprint. These deliverables are ready for release or have met the agreed acceptance criteria.</p>`,
    completedBlocks,
    `<h2>Incomplete / Deferred Items</h2>`,
    `<p>The following items were not completed within the sprint and have been moved to a future sprint or backlog. The reason for each deferred item should be documented to ensure visibility and proper planning.</p>`,
    incompleteBlocks,
  ].join("");
}
