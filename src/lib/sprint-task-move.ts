/**
 * What moving a task out of a sprint destroys.
 *
 * Two different things get cleared, for two different reasons, and the warning
 * has to name only the ones this particular move actually affects — a dialog
 * that over-claims gets dismissed without being read.
 *
 * - Decision and Risk were agreed for the task *in that sprint*. Any departure
 *   loses them, including a handover to another sprint.
 * - Estimate and assignee belong to the task itself. `setTaskSprint` only nulls
 *   them when the task returns to the backlog; handing it to another sprint
 *   keeps both.
 */

export type MoveClearInput = {
  /** Non-null once someone has written a Decision for this task in this sprint. */
  hasDecision: boolean;
  hasRisk: boolean;
  hasEstimate: boolean;
  hasAssignee: boolean;
};

export type SprintTaskMove = {
  fromSprintId: string | null;
  toSprintId: string | null;
};

/**
 * The fields a move clears, in the order the dialog lists them.
 *
 * Empty means nothing is lost and the move should go through without asking.
 */
export function fieldsClearedByMove(
  move: SprintTaskMove,
  filled: MoveClearInput,
): string[] {
  // Not leaving a sprint: joining one, or being reordered inside one.
  if (!move.fromSprintId) return [];
  if (move.fromSprintId === move.toSprintId) return [];

  const cleared: string[] = [];
  if (filled.hasDecision) cleared.push("Decision");
  if (filled.hasRisk) cleared.push("Risk");
  if (!move.toSprintId) {
    if (filled.hasEstimate) cleared.push("Estimate");
    if (filled.hasAssignee) cleared.push("Assignee");
  }
  return cleared;
}

/**
 * Whether this move has to be explained.
 *
 * A running sprint is a commitment, and its document reports every task that
 * joined or left after it started. Those entries are only worth reading with a
 * reason beside them, so both directions ask for one and the server refuses the
 * move without it. Planning moves commit to nothing and ask for nothing.
 *
 * Shared so the dialog asks exactly when the server insists — a board that
 * skipped the question here would send a move that comes back as an error.
 */
export function moveNeedsReason(move: {
  fromSprintStatus: string | null;
  toSprintStatus: string | null;
}): boolean {
  return move.fromSprintStatus === "ACTIVE" || move.toSprintStatus === "ACTIVE";
}
