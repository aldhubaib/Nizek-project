import { isUnstartedSprint } from "@/lib/sprint-status";

/**
 * What the viewer is allowed to do with a project's sprints, which is all a
 * sprint document needs to know about who is reading it.
 */
export type SprintDocRights = {
  isAdmin: boolean;
  canCreateSprintPlanning: boolean;
  canStartSprint: boolean;
  canEndSprint: boolean;
  /** Clients read the document; they never write to it. */
  isClient: boolean;
};

export const NO_SPRINT_DOC_RIGHTS: SprintDocRights = {
  isAdmin: false,
  canCreateSprintPlanning: false,
  canStartSprint: false,
  canEndSprint: false,
  isClient: false,
};

/**
 * Whether this viewer may write the sprint document as it stands right now.
 *
 * The document is written in phases and each phase belongs to whoever owns that
 * part of the sprint: the plan to whoever plans, the outcome to whoever ends it.
 * Once the sprint closes the document is a record, and only an admin amends a
 * record.
 *
 * Shared so that the document answers this the same way wherever it is opened —
 * the road map, a chat card, a client's copy — instead of each caller deciding
 * again and drifting.
 */
export function canEditSprintDoc(
  rights: SprintDocRights,
  status: string | null | undefined,
): boolean {
  if (rights.isClient) return false;
  if (rights.isAdmin) return true;
  if (isUnstartedSprint(status ?? "")) return rights.canCreateSprintPlanning;
  if (status === "ACTIVE") return rights.canEndSprint;
  return false;
}
