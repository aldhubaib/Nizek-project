"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { createTaskRecord } from "@/lib/create-task-record";
import { isBuiltInTaskFieldQuestion } from "@/lib/task-readiness";
import { APP_SETTINGS_ID } from "@/lib/alias-mask";
import { postClientIssueCards } from "@/lib/chat-cards";
import { clientIssueTypeLabel } from "@/lib/client-issue-payload";
import type { TaskQuestion } from "@/components/kanban/question-field";
import type { TaskType } from "@/generated/prisma/client";

/**
 * Clients raising their own issues.
 *
 * Everywhere else in the app a client is a reader — `canCreateTask` is forced
 * off for their project role, and client rooms hard-disable create-task. This
 * is the one deliberate write, and it is narrow by construction: only the issue
 * types an admin has opened in the Questions tab, only those the project's
 * contract already allows, and only ever into Backlog.
 */

export type ClientIssueType = {
  taskType: TaskType;
  label: string;
  questions: TaskQuestion[];
};

export type ClientIssueForm = {
  projectName: string;
  types: ClientIssueType[];
};

async function reportableTypes(): Promise<TaskType[]> {
  const row = await prisma.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
    select: { clientIssueTypes: true },
  });
  return row?.clientIssueTypes ?? [];
}

/**
 * What this client may raise on this project, and what they will be asked.
 *
 * Empty `types` is the normal answer, not an error: it means no admin has
 * opened a type, or the contract does not permit the ones they have. The chat
 * hides the action rather than offering an empty form.
 */
export async function getClientIssueForm(projectId: string): Promise<ClientIssueForm> {
  const { user } = await requireProjectMember(projectId);
  if (!isClientUser(user)) throw new Error("Permission denied");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, contracts: true },
  });
  if (!project) throw new Error("Project not found");

  const contract = getActiveContract(project.contracts);
  if (!contract) return { projectName: project.name, types: [] };

  const enabled = await reportableTypes();
  // Never widened by the admin switch: a type the contract does not cover
  // cannot be reported into it, exactly as createTask would refuse.
  const allowed = getAllowedTaskTypes(contract.contractType, false).filter((t) =>
    enabled.includes(t),
  );
  if (allowed.length === 0) return { projectName: project.name, types: [] };

  const questions = await prisma.defaultQuestion.findMany({
    where: { taskType: { in: allowed } },
    orderBy: { order: "asc" },
    select: {
      id: true,
      question: true,
      type: true,
      options: true,
      multiple: true,
      mandatory: true,
      order: true,
      taskType: true,
    },
  });

  return {
    projectName: project.name,
    types: allowed.map((taskType) => ({
      taskType,
      label: clientIssueTypeLabel(taskType),
      questions: questions.filter(
        (q) =>
          q.taskType === taskType &&
          !isBuiltInTaskFieldQuestion(q.question) &&
          // A "client" question models the team waiting on this person; asking
          // them to fill in their own dependency makes no sense on this form.
          q.type !== "client",
      ),
    })),
  };
}

/**
 * A line of the report to put on the card. Text answers only — a file answer
 * is `name::url` and a multi-select is JSON, neither of which reads as prose.
 */
function issueExcerpt(
  answers: { questionId: string; answer: string }[],
  byId: Map<string, { type: string; order: number }>,
): string | undefined {
  const first = answers
    .filter((a) => byId.get(a.questionId)?.type === "text" && a.answer.trim())
    .sort((a, b) => (byId.get(a.questionId)!.order - byId.get(b.questionId)!.order))[0];
  return first?.answer.trim().slice(0, 240);
}

export async function reportClientIssue(input: {
  projectId: string;
  taskType: TaskType;
  title: string;
  answers?: { questionId: string; answer: string }[];
}): Promise<{ taskId: string; taskNumber: number }> {
  const { user } = await requireProjectMember(input.projectId);
  if (!isClientUser(user)) throw new Error("Permission denied");

  const title = input.title.trim();
  if (!title) throw new Error("Describe the issue in a line or two");

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { contracts: true },
  });
  if (!project) throw new Error("Project not found");

  const contract = getActiveContract(project.contracts);
  if (!contract) throw new Error("This project is not active");

  const enabled = await reportableTypes();
  const allowed = getAllowedTaskTypes(contract.contractType, false);
  if (!enabled.includes(input.taskType) || !allowed.includes(input.taskType)) {
    throw new Error("That is not something you can report on this project");
  }

  // Trust nothing from the form about which questions belong here: an answer
  // aimed at another type's question would otherwise be written onto the task.
  const questions = await prisma.defaultQuestion.findMany({
    where: { taskType: input.taskType },
    select: { id: true, type: true, order: true },
    orderBy: { order: "asc" },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers = (input.answers ?? []).filter((a) => byId.has(a.questionId));

  const task = await createTaskRecord({
    projectId: input.projectId,
    actorId: user.id,
    title,
    taskType: input.taskType,
    answers,
    audience: "client",
  });

  // The report is filed either way; a chat delivery failure must not read back
  // to the client as "that did not work" and invite them to file it twice.
  try {
    await postClientIssueCards({
      authorId: user.id,
      payload: {
        taskId: task.id,
        taskNumber: task.taskNumber,
        projectId: input.projectId,
        taskType: input.taskType,
        title,
        excerpt: issueExcerpt(answers, byId),
      },
    });
  } catch (err) {
    console.error("[client issue chat]", err);
  }

  return { taskId: task.id, taskNumber: task.taskNumber };
}
