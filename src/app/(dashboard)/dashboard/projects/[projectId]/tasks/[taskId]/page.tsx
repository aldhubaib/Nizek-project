import { prisma } from "@/lib/prisma";
import { getTaskQuestions, getTaskAnswers } from "@/actions/task-question";
import { getTaskHistory } from "@/actions/task-history";
import { getTaskNotes } from "@/actions/meeting-note";
import { requireProjectMember } from "@/lib/auth";
import { getPermissionsFromRole, getAdminPermissions } from "@/lib/permissions";
import { taskEditBlockedReason } from "@/lib/task-edit-lock";
import { isProjectAccessError } from "@/lib/project-access";
import { notFound } from "next/navigation";
import { TaskDetailPage as TaskDetailClient } from "./task-detail-view";

interface Props {
  params: Promise<{ projectId: string; taskId: string }>;
  searchParams: Promise<{ threadId?: string; from?: string; noteId?: string; view?: string }>;
}

export default async function TaskDetailPage({ params, searchParams }: Props) {
  const { projectId, taskId } = await params;
  const { threadId, from, noteId, view } = await searchParams;

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

  if (!task || task.projectId !== projectId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-s text-muted-foreground">Task not found.</p>
      </div>
    );
  }

  const { user, member } = await requireProjectMember(task.projectId).catch(
    (err): never => {
      if (isProjectAccessError(err)) notFound();
      throw err;
    }
  );

  const userPermissions =
    user.systemRole === "ADMIN"
      ? { ...getAdminPermissions(), systemRole: "ADMIN" as const }
      : { ...getPermissionsFromRole(member.projectRole), systemRole: user.systemRole };

  const [questions, existingAnswers, history, notes] = await Promise.all([
    getTaskQuestions(),
    getTaskAnswers(taskId),
    getTaskHistory(taskId),
    getTaskNotes(taskId),
  ]).catch((err): never => {
    if (isProjectAccessError(err)) notFound();
    throw err;
  });

  const answersMap: Record<string, string> = {};
  existingAnswers.forEach((a: { questionId: string; answer: string }) => {
    answersMap[a.questionId] = a.answer;
  });

  return (
    <TaskDetailClient
      task={{
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
      }}
      projectId={projectId}
      projectName={task.project.name}
      questions={questions}
      initialAnswers={answersMap}
      initialNotes={notes}
      history={history.allowed ? history : null}
      isAdmin={user.systemRole === "ADMIN"}
      canDelete={user.systemRole === "ADMIN" || userPermissions.canDeleteTask}
      editBlockedReason={taskEditBlockedReason({
        contracts: task.project.contracts,
        isSystemAdmin: user.systemRole === "ADMIN",
        permissions: userPermissions,
        stage: task.stage,
      })}
      initialThreadId={threadId ?? null}
      backToNoteId={from === "note" ? (noteId ?? null) : null}
      backToTab={from && from !== "note" ? from : null}
      initialNoteView={view === "note"}
    />
  );
}
