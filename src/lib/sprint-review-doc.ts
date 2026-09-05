import {
  planningInfoFromHtml,
  sprintIdFromPlanningHtml,
  type SprintPlanningInfo,
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

/**
 * When each sprint was reviewed, keyed by sprint.
 *
 * The sprint document carries two dates: when it was planned and when it was
 * reviewed. Only the second one belongs here, so a document whose review half
 * was never dated contributes nothing and the caller falls back to the sprint's
 * own completedAt. Documents predating the column are still matched by digging
 * the sprint id out of the HTML.
 */
export function reviewDateBySprintId(
  notes: { content: string; sprintId?: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const note of notes) {
    const sprintId = note.sprintId ?? sprintIdFromReviewHtml(note.content);
    if (!sprintId || map.has(sprintId)) continue;
    const iso = planningInfoFromHtml(note.content)?.reviewDateIso;
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

// The review document generator lived here. There is no review document any
// more — see sprintOutcomeSectionsHtml in src/lib/sprint-doc.ts, which writes
// the same sections into the second half of the sprint document.
