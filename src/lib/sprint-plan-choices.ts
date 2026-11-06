/**
 * Decision and Risk on a planned task, as a choice before words. The new panel asks each as two
 * buttons — "As described" or "Different decision", "No risk" or "Risk" — and the first answer
 * is one sentence the document stores, so the live panel (which shows the fields as text) and
 * the start check (which wants both filled) read it like anything typed. The second answer
 * opens a box; what is written there is the field's value, as before.
 */

/** Stored when the team decides to do the task as it is described: nothing different. */
export const DECISION_AS_DESCRIBED = "Proceed as described.";

/** Stored when the team sees nothing that could block or delay the task. */
export const RISK_NONE = "No risk.";

/** What a field holds: the stock sentence, something written, or nothing yet. */
export type PlanChoice = "none" | "some" | null;

/** Letters only, so "no risk", "No Risk." and the stock sentence are the same answer. */
function key(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Whether a saved value is the stock "nothing" sentence (however it was punctuated or cased). */
export function isPlanChoiceNone(value: string | null | undefined, noneText: string): boolean {
  const v = key(value ?? "");
  return v !== "" && v === key(noneText);
}

/** Which button a saved value stands for; null when the field is still empty. */
export function planChoiceOf(value: string | null | undefined, noneText: string): PlanChoice {
  if (isPlanChoiceNone(value, noneText)) return "none";
  return (value ?? "").trim() === "" ? null : "some";
}
