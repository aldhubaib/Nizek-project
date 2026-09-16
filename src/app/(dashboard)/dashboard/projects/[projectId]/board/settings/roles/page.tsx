import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { ensureProjectBoard } from "@/actions/board-record";
import { WorkflowRolesManager } from "@/components/workflow/workflow-roles-manager";

export default async function ProjectBoardRolesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  try {
    await requireProjectMember(projectId);
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }

  await ensureProjectBoard(projectId);

  return (
    <WorkflowRolesManager
      entityType="board"
      projectId={projectId}
      backHref={`/dashboard/projects/${projectId}/board/settings`}
      backLabel="Back to settings"
      title="Board roles"
    />
  );
}
