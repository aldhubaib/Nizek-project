"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getDefaultQuestions(taskType?: "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN") {
  await requireUser();
  return prisma.defaultQuestion.findMany({
    where: taskType ? { taskType } : {},
    orderBy: { order: "asc" },
  });
}

export async function addDefaultQuestion(data: {
  question: string;
  type?: "text" | "select" | "file" | "link" | "client";
  options?: string[];
  mandatory?: boolean;
  required?: boolean;
  taskType?: "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
}) {
  await requireUser();

  const taskType = data.taskType ?? "FEATURE";

  const maxOrder = await prisma.defaultQuestion.aggregate({
    where: { taskType },
    _max: { order: true },
  });

  const question = await prisma.defaultQuestion.create({
    data: {
      question: data.question,
      type: data.type ?? "text",
      options: data.options ? JSON.stringify(data.options) : null,
      mandatory: data.mandatory ?? false,
      required: data.required ?? false,
      order: (maxOrder._max.order ?? 0) + 1,
      taskType,
    },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/projects");
  return question;
}

export async function updateDefaultQuestion(data: {
  questionId: string;
  question?: string;
  type?: "text" | "select" | "file" | "link" | "client";
  options?: string[];
  mandatory?: boolean;
  required?: boolean;
}) {
  await requireUser();

  const updated = await prisma.defaultQuestion.update({
    where: { id: data.questionId },
    data: {
      ...(data.question !== undefined && { question: data.question }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.options !== undefined && { options: JSON.stringify(data.options) }),
      ...(data.mandatory !== undefined && { mandatory: data.mandatory }),
      ...(data.required !== undefined && { required: data.required }),
    },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/projects");
  return updated;
}

export async function deleteDefaultQuestion(questionId: string) {
  await requireUser();
  await prisma.defaultQuestion.delete({ where: { id: questionId } });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/projects");
}

export async function reorderDefaultQuestions(orderedIds: string[]) {
  await requireUser();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.defaultQuestion.update({ where: { id }, data: { order: index + 1 } })
    )
  );
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/projects");
}
