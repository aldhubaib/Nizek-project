import { prisma } from "@/lib/prisma";
import { getTaskQuestions, getTaskAnswers } from "@/actions/task-question";
import { requireProjectMember } from "@/lib/auth";
import { TaskDetailView } from "./task-detail-view";

interface Props {
  params: Promise<{ projectId: string; taskId: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { projectId, taskId } = await params;

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

  await requireProjectMember(task.projectId);

  const [questions, existingAnswers] = await Promise.all([
    getTaskQuestions(),
    getTaskAnswers(taskId),
  ]);

  const answersMap: Record<string, string> = {};
  existingAnswers.forEach((a: { questionId: string; answer: string }) => {
    answersMap[a.questionId] = a.answer;
  });

  return (
    <TaskDetailView
      task={{
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority ?? 0,
        taskType: task.taskType,
        stage: task.stage,
        assignee: task.assignee,
        createdBy: task.createdBy,
        createdAt: task.createdAt,
      }}
      projectId={projectId}
      projectName={task.project.name}
      questions={questions}
      initialAnswers={answersMap}
    />
  );
}
