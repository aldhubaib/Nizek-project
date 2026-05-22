import { getProject } from "@/actions/project";
import { getTaskQuestions } from "@/actions/task-question";
import { requireProjectMember } from "@/lib/auth";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { redirect } from "next/navigation";
import { NewTaskForm } from "./new-task-form";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function NewTaskPage({ params }: Props) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const questions = await getTaskQuestions();
  const { user } = await requireProjectMember(project.id);

  const activeContract = getActiveContract(project.contracts);
  if (!activeContract) {
    redirect(`/dashboard/projects/${projectId}?tab=board`);
  }

  const allowedTaskTypes = getAllowedTaskTypes(
    activeContract.contractType,
    user.systemRole === "ADMIN"
  );

  return (
    <NewTaskForm
      projectId={project.id}
      projectName={project.name}
      questions={questions}
      allowedTaskTypes={allowedTaskTypes}
      activeContractType={activeContract.contractType}
    />
  );
}
