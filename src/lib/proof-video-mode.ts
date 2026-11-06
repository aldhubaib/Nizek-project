/**
 * The project's "video bypass" setting: how a task proves its work on the way
 * into Internal Review. One place for the three modes, their names and what
 * each one asks for, so the settings pages, the proof dialog, the sprint
 * document and the server all say the same thing.
 */

export type ProofVideoMode = "SELF" | "ASSIGNED" | "NONE";

export const PROOF_VIDEO_MODES: ProofVideoMode[] = ["SELF", "ASSIGNED", "NONE"];

export const DEFAULT_PROOF_VIDEO_MODE: ProofVideoMode = "SELF";

export const PROOF_VIDEO_MODE_LABEL: Record<ProofVideoMode, string> = {
  SELF: "Default",
  ASSIGNED: "Assign",
  NONE: "No video",
};

/** One sentence per mode, for the settings pages. */
export const PROOF_VIDEO_MODE_HINT: Record<ProofVideoMode, string> = {
  SELF: "Whoever moves a task to Internal Review uploads its video. Nobody can skip it.",
  ASSIGNED: "The same, or they can hand the task to the people assigned below, who record and upload the video for them.",
  NONE: "No video per task. The sprint review must have a video before the sprint can end.",
};

export function isProofVideoMode(value: unknown): value is ProofVideoMode {
  return typeof value === "string" && (PROOF_VIDEO_MODES as string[]).includes(value);
}

/** A stored value, or the default when nothing (or something unknown) is stored. */
export function proofVideoModeOf(value: string | null | undefined): ProofVideoMode {
  return isProofVideoMode(value) ? value : DEFAULT_PROOF_VIDEO_MODE;
}

/** Whether a task on this project needs a proof video to enter Internal Review. */
export function taskVideoRequired(mode: ProofVideoMode): boolean {
  return mode !== "NONE";
}

/** Whether a task may be handed to the assigned uploaders instead of uploading oneself. */
export function canHandOverVideo(mode: ProofVideoMode): boolean {
  return mode === "ASSIGNED";
}

/** Whether ending a sprint needs a review video on the sprint itself. */
export function sprintReviewVideoRequired(mode: ProofVideoMode): boolean {
  return mode === "NONE";
}

/** What the sprint document and the server both say when that video is missing. */
export const SPRINT_REVIEW_VIDEO_MISSING = "Upload the sprint review video before ending the sprint.";

/** "Sara, Omar and Lina" — the uploaders, named in a sentence. */
export function nameList(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}
