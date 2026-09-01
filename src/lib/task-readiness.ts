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

/**
 * Priority lives on the task (Details), not in Task Questions.
 * A leftover "Priority" question must never block Backlog.
 */
export function isBuiltInTaskFieldQuestion(question: string | undefined | null): boolean {
  return question?.trim().toLowerCase() === "priority";
}

/**
 * Spec fields that decide Backlog vs Missing Data.
 *
 * Every question on the form counts. If it was worth asking, an unanswered
 * answer is missing data — the flags do not enter into it. `mandatory` says a
 * question blocks task creation outright, which is a separate gate enforced in
 * createTask, and leaving readiness to the flags meant a workspace that had
 * never set one could never surface a single task as missing data.
 *
 * Two kinds of question are still skipped, because neither holds a spec answer:
 * client questions record a dependency on the client rather than answer
 * anything (isWaitingOnClientAnswer covers those), and priority lives on the
 * task's own Details, so a leftover "Priority" question must not hold a task.
 */
export function isReadinessQuestion(q: {
  type: string;
  question?: string;
}): boolean {
  if (q.type === "client") return false;
  if (isBuiltInTaskFieldQuestion(q.question)) return false;
  return true;
}

/** Unassigned BACKLOG work that still has unanswered spec questions. */
export function isMissingDataTask(task: {
  stage: string;
  sprintId?: string | null;
  isReadyForTransition?: boolean;
}): boolean {
  return task.stage === "BACKLOG" && !task.isReadyForTransition;
}

export function computeIsReadyForTransition(
  questions: { id: string; type: string; question?: string }[],
  answers: Record<string, string>,
): boolean {
  const specQs = questions.filter(isReadinessQuestion);
  const allAnswered = specQs.every((q) => isQuestionAnswerFilled(q.type, answers[q.id]));
  const waitingOnClient = questions.some((q) => isWaitingOnClientAnswer(q.type, answers[q.id]));
  return allAnswered && !waitingOnClient;
}
