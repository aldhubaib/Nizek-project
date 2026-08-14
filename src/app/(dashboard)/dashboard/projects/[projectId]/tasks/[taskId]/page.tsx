import { prisma } from "@/lib/prisma";
import { getTaskQuestions, getTaskAnswers } from "@/actions/task-question";
import { getTaskStageLogs } from "@/actions/task";
import { getTaskNotes } from "@/actions/meeting-note";
import { requireProjectMember } from "@/lib/auth";
import { getPermissionsFromRole, getAdminPermissions } from "@/lib/permissions";
import { isProjectAccessError } from "@/lib/project-access";
import { notFound } from "next/navigation";
import { TaskDetailPage as TaskDetailClient } from "./task-detail-view";

interface Props {
  params: Promise<{ projectId: string; taskId: string }>;
  searchParams: Promise<{ threadId?: string; from?: string; noteId?: string }>;
}

export default async function TaskDetailPage({ params, searchParams }: Props) {
  const { projectId, taskId } = await params;
  const { threadId, from, noteId } = await searchParams;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      assignee: true,
      createdBy: true,
    },
  });

  if (!task || task.projectId !== projectId) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-48px)]">
        <p className="text-[13px] text-muted-foreground">Task not found.</p>
      </div>
    );
  }

  const { user, member } = await requireProjectMember(task.projectId).catch(
    (err): never => {
      if (isProjectAccessError(err)) notFound();
      throw err;
    }
  );

  let userPermissions;
  if (user.systemRole === "ADMIN") {
    userPermissions = { ...getAdminPermissions(), systemRole: "ADMIN" };
  } else {
    userPermissions = { ...getPermissionsFromRole(member.projectRole), systemRole: user.systemRole };
  }

  const [questions, existingAnswers, stageLogData, notes] = await Promise.all([
    getTaskQuestions(),
    getTaskAnswers(taskId),
    getTaskStageLogs(taskId),
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
      }}
      projectId={projectId}
      projectName={task.project.name}
      questions={questions}
      initialAnswers={answersMap}
      stageLogData={stageLogData}
      initialNotes={notes}
      isAdmin={user.systemRole === "ADMIN"}
      canDelete={user.systemRole === "ADMIN" || userPermissions.canDeleteTask}
      canSkipClientReview={
        user.systemRole === "ADMIN" ||
        (userPermissions.canMoveTask &&
          (userPermissions.allowedTransitions?.["INTERNAL_REVIEW"] ?? []).includes("READY_FOR_RELEASE"))
      }
      initialThreadId={threadId ?? null}
      backToNoteId={from === "note" ? (noteId ?? null) : null}
    />
  );
}
