import "server-only";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { applyStageChange } from "@/lib/stage-transition";
import { broadcastTaskEvent } from "@/lib/centrifugo";
import { isBuiltInTaskFieldQuestion } from "@/lib/task-readiness";
import { DEFAULT_TASK_PRIORITY, isTaskPriority, type TaskPriorityId } from "@/lib/task-label";
import type { TaskType } from "@/generated/prisma/client";

/**
 * Write one task, with everything a task is owed on the way in: a task number,
 * a place at the end of Backlog, its answers, the opening entry in its stage
 * history, a "created" activity row, and the board event.
 *
 * Callers decide who is allowed to be here. createTask enforces the team's
 * canCreateTask permission; reportClientIssue enforces the opposite — that the
 * author is a client raising a type an admin has opened to them. Both end up
 * with a task that behaves identically afterwards, which is the point of this
 * living in one place.
 */
export async function createTaskRecord(input: {
  projectId: string;
  actorId: string;
  title: string;
  description?: string;
  priority?: TaskPriorityId;
  taskType: TaskType;
  assigneeId?: string | null;
  answers?: { questionId: string; answer: string }[];
  /** Who is filling the form in; decides which questions they can be held to. */
  audience?: TaskAudience;
}) {
  const {
    projectId,
    actorId,
    title,
    description,
    taskType,
    assigneeId,
    answers,
    audience = "team",
  } = input;

  const [maxOrder, maxTaskNumber] = await Promise.all([
    prisma.task.aggregate({
      where: { projectId, stage: "BACKLOG", archivedAt: null },
      _max: { order: true },
    }),
    prisma.task.aggregate({
      where: { projectId },
      _max: { taskNumber: true },
    }),
  ]);

  await assertMandatoryQuestionsAnswered(taskType, answers, audience);

  const priority = isTaskPriority(input.priority)
    ? input.priority
    : DEFAULT_TASK_PRIORITY;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        taskNumber: (maxTaskNumber._max.taskNumber ?? 0) + 1,
        title,
        description,
        priority,
        taskType,
        stage: "BACKLOG",
        order: (maxOrder._max.order ?? 0) + 1,
        projectId,
        createdById: actorId,
        assigneeId: assigneeId ?? null,
        ...(answers?.length && {
          answers: {
            create: answers
              .filter((a) => a.answer.trim())
              .map((a) => ({ questionId: a.questionId, answer: a.answer })),
          },
        }),
      },
    });

    // Opens the task's history. Without this the first stage it ever sat in has
    // no entry time, so every later duration is measured from the wrong start.
    await applyStageChange(tx, {
      taskId: created.id,
      fromStage: null,
      toStage: "BACKLOG",
      actorId,
      source: "TASK_CREATED",
      assigneeId: created.assigneeId,
      at: created.createdAt,
    });

    await tx.taskActivity.create({
      data: {
        taskId: created.id,
        userId: actorId,
        action: "created",
        newValue: created.title,
      },
    });

    return created;
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  broadcastTaskEvent(projectId, {
    type: "task-created",
    taskId: task.id,
    userId: actorId,
  });
  return task;
}

export type TaskAudience = "team" | "client";

/**
 * The mandatory questions for this type have to be answered before the task
 * exists. Thrown in the shape the task forms already parse, so the caller can
 * name the questions that are missing rather than saying "something is wrong".
 *
 * A `client` question records the team waiting on the client for something, so
 * it is not a question the client can be asked — their form leaves those out,
 * and holding them to one would make the type impossible to report.
 */
export async function assertMandatoryQuestionsAnswered(
  taskType: TaskType,
  answers: { questionId: string; answer: string }[] | undefined,
  audience: TaskAudience = "team",
): Promise<void> {
  const mandatory = (
    await prisma.defaultQuestion.findMany({
      where: {
        taskType,
        mandatory: true,
        ...(audience === "client" && { type: { not: "client" } }),
      },
      select: { id: true, question: true },
    })
  ).filter((q) => !isBuiltInTaskFieldQuestion(q.question));
  if (mandatory.length === 0) return;

  const answered = new Map((answers ?? []).map((a) => [a.questionId, a.answer]));
  const unanswered = mandatory.filter((q) => !answered.get(q.id)?.trim());
  if (unanswered.length === 0) return;

  throw new Error(
    `MANDATORY_QUESTIONS:${JSON.stringify(unanswered.map((q) => q.question))}`,
  );
}
