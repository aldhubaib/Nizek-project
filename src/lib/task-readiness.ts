/** True when a non-client question has a real answer (not blank / empty list). */
export function isQuestionAnswerFilled(
  type: string,
  answer: string | undefined | null,
): boolean {
  if (type === "client") return true;
  if (!answer || !answer.trim()) return false;
  if (type === "file" || type === "select") {
    try {
      const parsed = JSON.parse(answer);
      if (Array.isArray(parsed)) return parsed.length > 0;
    } catch {
      // plain string select / leftover text
    }
  }
  return true;
}

export function isWaitingOnClientAnswer(
  type: string,
  answer: string | undefined | null,
): boolean {
  if (type !== "client" || !answer) return false;
  try {
    const parsed = JSON.parse(answer);
    return parsed.needed === true && !parsed.completed;
  } catch {
    return false;
  }
}

/** Unassigned NEW_REQUEST work that still has unanswered spec questions. */
export function isMissingDataTask(task: {
  stage: string;
  sprintId?: string | null;
  isReadyForTransition?: boolean;
}): boolean {
  return task.stage === "NEW_REQUEST" && !task.isReadyForTransition;
}

export function computeIsReadyForTransition(
  questions: { id: string; type: string }[],
  answers: Record<string, string>,
): boolean {
  const specQs = questions.filter((q) => q.type !== "client");
  const allAnswered = specQs.every((q) => isQuestionAnswerFilled(q.type, answers[q.id]));
  const waitingOnClient = questions.some((q) => isWaitingOnClientAnswer(q.type, answers[q.id]));
  return allAnswered && !waitingOnClient;
}
