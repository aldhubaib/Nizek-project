"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { getAdminPermissions, getPermissionsFromRole } from "@/lib/permissions";
import { taskEditBlockedReason } from "@/lib/task-edit-lock";
import { getTaskQuestions, getTaskAnswers } from "@/actions/task-question";
import { getTaskNotes } from "@/actions/meeting-note";

export async function getTaskDetailPanel(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { include: { contracts: true } },
      assignee: true,
      createdBy: true,
      sprint: true,
      sprintSnapshots: {
        include: { sprint: true },
      },
    },
  });
  if (!task) throw new Error("Task not found");

  const { user, member } = await requireProjectMember(task.projectId);
  const userPermissions =
    user.systemRole === "ADMIN"
      ? { ...getAdminPermissions(), systemRole: "ADMIN" as const }
      : { ...getPermissionsFromRole(member.projectRole), systemRole: user.systemRole };

  const [questions, existingAnswers, notes] = await Promise.all([
    getTaskQuestions(),
    getTaskAnswers(taskId),
    getTaskNotes(taskId),
  ]);

  const initialAnswers: Record<string, string> = {};
  existingAnswers.forEach((a: { questionId: string; answer: string }) => {
    initialAnswers[a.questionId] = a.answer;
  });

  return {
    projectId: task.projectId,
    projectName: task.project.name,
    questions,
    initialAnswers,
    initialNotes: notes,
    isAdmin: user.systemRole === "ADMIN",
    canDelete: user.systemRole === "ADMIN" || userPermissions.canDeleteTask,
    editBlockedReason: taskEditBlockedReason({
      contracts: task.project.contracts,
      isSystemAdmin: user.systemRole === "ADMIN",
      permissions: userPermissions,
      stage: task.stage,
    }),
    task: {
      id: task.id,
      taskNumber: task.taskNumber,
      title: task.title,
      description: task.description,
      priority: task.priority,
      taskType: task.taskType,
      stage: task.stage,
      order: task.order,
      assignee: task.assignee,
      createdBy: task.createdBy,
      createdAt: task.createdAt.toISOString(),
      estimatedMinutes: task.estimatedMinutes,
      estimateAccuracy: task.estimateAccuracy,
      sprints: [
        ...(task.sprint
          ? [
              {
                id: task.sprint.id,
                name: task.sprint.name,
                status: task.sprint.status,
                startDate: task.sprint.startDate.toISOString(),
                endDate: task.sprint.endDate.toISOString(),
                estimatedMinutes: task.estimatedMinutes,
              },
            ]
          : []),
        ...task.sprintSnapshots
          .filter((snap) => snap.sprintId !== task.sprintId)
          .slice()
          .sort(
            (a, b) =>
              new Date(b.sprint.endDate).getTime() - new Date(a.sprint.endDate).getTime(),
          )
          .map((snap) => ({
            id: snap.sprint.id,
            name: snap.sprint.name,
            status: snap.sprint.status,
            startDate: snap.sprint.startDate.toISOString(),
            endDate: snap.sprint.endDate.toISOString(),
            estimatedMinutes: snap.estimatedMinutes,
          })),
      ],
    },
  };
}
