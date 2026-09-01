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
 * Only a mandatory question holds a task in Missing data. An optional question
 * is one the form offers, not one the task owes, so leaving it blank is a
 * choice rather than an omission — a task is not incomplete for skipping an
 * attachment nobody asked it to carry.
 *
 * `mandatory` is deliberately required rather than optional here. Reading it
 * off a partial select would quietly answer "not mandatory" for every
 * question and silently retire Missing data altogether, so the type forces
 * each caller to fetch the flag.
 *
 * Two kinds of question are skipped even when marked mandatory, because
 * neither holds a spec answer: client questions record a dependency on the
 * client rather than answer anything (isWaitingOnClientAnswer covers those),
 * and priority lives on the task's own Details, so a leftover "Priority"
 * question must not hold a task.
 */
export function isReadinessQuestion(q: {
  type: string;
  question?: string;
  mandatory: boolean;
}): boolean {
  if (!q.mandatory) return false;
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
  questions: { id: string; type: string; question?: string; mandatory: boolean }[],
  answers: Record<string, string>,
): boolean {
  const specQs = questions.filter(isReadinessQuestion);
  const allAnswered = specQs.every((q) => isQuestionAnswerFilled(q.type, answers[q.id]));
  const waitingOnClient = questions.some((q) => isWaitingOnClientAnswer(q.type, answers[q.id]));
  return allAnswered && !waitingOnClient;
}
