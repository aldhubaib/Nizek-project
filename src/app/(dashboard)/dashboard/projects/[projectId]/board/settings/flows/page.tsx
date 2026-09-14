import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { getWorkflowSettings } from "@/actions/workflow";
import { listFormLayouts } from "@/actions/custom-field";
import { ensureProjectBoard } from "@/actions/board-record";
import { DealFlowsClient } from "@/app/(dashboard)/dashboard/deals/settings/flows/deal-flows-client";

export default async function ProjectBoardFlowsPage({
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
  const [settings, layouts] = await Promise.all([
    getWorkflowSettings("board", projectId),
    listFormLayouts("board", projectId),
  ]);

  return (
    <DealFlowsClient
      initial={settings.workflows}
      layouts={layouts}
      entityType="board"
      projectId={projectId}
      basePath={`/dashboard/projects/${projectId}/board/settings`}
    />
  );
}
