"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireProjectMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logTaskActivity } from "@/lib/activity";

export async function getTaskQuestions(taskType?: "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN") {
  await requireUser();
  return prisma.defaultQuestion.findMany({
    where: taskType ? { taskType } : {},
    orderBy: { order: "asc" },
  });
}

export async function saveTaskAnswers(data: {
  taskId: string;
  answers: { questionId: string; answer: string }[];
}) {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    include: { project: true, answers: { include: { question: true } } },
  });
  if (!task) throw new Error("Task not found");
  const { user } = await requireProjectMember(task.projectId);

  const existingMap = new Map(task.answers.map((a) => [a.questionId, a.answer]));

  const upserts = data.answers.map((a) =>
    prisma.taskAnswer.upsert({
      where: { taskId_questionId: { taskId: data.taskId, questionId: a.questionId } },
      update: { answer: a.answer },
      create: { taskId: data.taskId, questionId: a.questionId, answer: a.answer },
    })
  );
  await prisma.$transaction(upserts);

  const activityLogs = data.answers
    .filter((a) => {
      const oldAnswer = existingMap.get(a.questionId);
      return oldAnswer !== a.answer && (oldAnswer || a.answer.trim());
    })
    .map((a) =>
      logTaskActivity({
        taskId: data.taskId,
        userId: user.id,
        action: "answered",
        field: `answer:${a.questionId}`,
        oldValue: existingMap.get(a.questionId) || null,
        newValue: a.answer || null,
      })
    );
  await Promise.all(activityLogs);

  revalidatePath(`/dashboard/projects/${task.projectId}`);
}

export async function getTaskAnswers(taskId: string) {
  return prisma.taskAnswer.findMany({
    where: { taskId },
    include: { question: true },
    orderBy: { question: { order: "asc" } },
  });
}
