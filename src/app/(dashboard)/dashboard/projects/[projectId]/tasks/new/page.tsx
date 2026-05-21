import { getProject } from "@/actions/project";
import { getTaskQuestions } from "@/actions/task-question";
import { requireProjectMember } from "@/lib/auth";
import { NewTaskForm } from "./new-task-form";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function NewTaskPage({ params }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const questions = await getTaskQuestions();
  await requireProjectMember(project.id);

  return (
    <NewTaskForm
      projectId={project.id}
      projectName={project.name}
      questions={questions}
    />
  );
}
