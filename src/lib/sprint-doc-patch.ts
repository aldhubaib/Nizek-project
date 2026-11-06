import type { SprintCardCarry } from "@/lib/sprint-doc";
import { escapeHtml, unescapeHtml } from "@/lib/sprint-planning-doc";

/**
 * Small writes into a sprint document's HTML, for a panel that has no document editor.
 *
 * The live panel's editor changes a card's attributes in place and autosaves the whole page.
 * The new panel edits one card at a time, so these helpers do the same change to the stored
 * HTML: find the task's card, set the attribute, leave every other byte as it was.
 */

const TASK_TAG_RE = /<div\b[^>]*data-type="sprint-task"[^>]*>/gi;

function tagAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return match ? unescapeHtml(match[1]) : null;
}

function setTagAttr(tag: string, name: string, value: string): string {
  const encoded = `${name}="${escapeHtml(value)}"`;
  const existing = new RegExp(`\\s${name}="[^"]*"`, "i");
  if (existing.test(tag)) return tag.replace(existing, ` ${encoded}`);
  return tag.replace(/\s*\/?>$/, (close) => ` ${encoded}${close}`);
}

/** Which task a card is about: its `data-id`, or the id inside the embedded task JSON. */
export function sprintTaskTagId(tag: string): string | null {
  const id = tagAttr(tag, "data-id");
  if (id) return id;
  const raw = tagAttr(tag, "data-task");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

/** The outcome's cards: how a task ended. The plan's rows and the removed section are records. */
const OUTCOME_VARIANTS = new Set(["completed", "incomplete"]);

/**
 * Write what was typed into a task's outcome card — the reason it was not completed, what was
 * delivered and the photos — into the document. Only the keys given are written; the rest of
 * the card, and the rest of the document, come back byte for byte. A document with no outcome
 * card for the task is returned unchanged.
 */
export function withSprintCardCarry(html: string, taskId: string, carry: Partial<SprintCardCarry>): string {
  return html.replace(TASK_TAG_RE, (tag) => {
    if (sprintTaskTagId(tag) !== taskId) return tag;
    if (!OUTCOME_VARIANTS.has(tagAttr(tag, "data-variant") ?? "")) return tag;
    let next = tag;
    if (carry.incompleteReason !== undefined) next = setTagAttr(next, "data-incomplete-reason", carry.incompleteReason);
    if (carry.description !== undefined) next = setTagAttr(next, "data-description", carry.description);
    if (carry.descriptionImages !== undefined) next = setTagAttr(next, "data-description-images", JSON.stringify(carry.descriptionImages));
    return next;
  });
}

/** Whether the document has an outcome card for the task (so a write to it would land). */
export function hasSprintOutcomeCard(html: string, taskId: string): boolean {
  for (const tag of html.match(TASK_TAG_RE) ?? []) {
    if (sprintTaskTagId(tag) === taskId && OUTCOME_VARIANTS.has(tagAttr(tag, "data-variant") ?? "")) return true;
  }
  return false;
}
