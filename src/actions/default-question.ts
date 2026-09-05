"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { APP_SETTINGS_ID } from "@/lib/alias-mask";
import type { TaskType } from "@/generated/prisma/client";

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
  multiple?: boolean;
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
      multiple: data.type === "select" ? (data.multiple ?? false) : false,
      mandatory: data.mandatory ?? false,
      required: data.required ?? true,
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
  multiple?: boolean;
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
      ...(data.multiple !== undefined && { multiple: data.multiple }),
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

// ─── Which issue types a client may raise ────────────────────────────────────

/** Read straight off the settings row; empty means clients cannot report. */
export async function getClientIssueTypes(): Promise<TaskType[]> {
  await requireUser();
  const row = await prisma.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
    select: { clientIssueTypes: true },
  });
  return row?.clientIssueTypes ?? [];
}

/**
 * Open or close one issue type to clients.
 *
 * Opening a type hands clients a write into the team's backlog, so this is
 * admin-only even though the rest of this file is not: the questions behind a
 * type are what shape what the client is asked, and both decisions belong to
 * whoever curates them.
 */
export async function setClientIssueTypeEnabled(
  taskType: TaskType,
  enabled: boolean,
): Promise<TaskType[]> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") {
    throw new Error("Only an admin can change what clients may report");
  }

  const current =
    (
      await prisma.appSettings.findUnique({
        where: { id: APP_SETTINGS_ID },
        select: { clientIssueTypes: true },
      })
    )?.clientIssueTypes ?? [];

  const next = enabled
    ? [...new Set([...current, taskType])]
    : current.filter((t) => t !== taskType);

  await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: { id: APP_SETTINGS_ID, clientIssueTypes: next, updatedById: user.id },
    update: { clientIssueTypes: next, updatedById: user.id },
  });

  // The client's chat reads this to decide whether New Issue is there at all.
  revalidatePath("/dashboard/messages", "layout");
  return next;
}
