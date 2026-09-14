import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { listWorkflows } from "@/actions/workflow";
import { listFormLayouts } from "@/actions/custom-field";
import { ensureProjectBoard } from "@/actions/board-record";
import { DealSettingsHub } from "@/app/(dashboard)/dashboard/deals/settings/deal-settings-hub";

export default async function ProjectBoardSettingsPage({
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
  const [flows, layouts] = await Promise.all([
    listWorkflows("board", projectId),
    listFormLayouts("board", projectId),
  ]);

  return (
    <DealSettingsHub
      flows={flows}
      layouts={layouts}
      entityType="board"
      projectId={projectId}
      basePath={`/dashboard/projects/${projectId}/board/settings`}
      backHref={`/dashboard/projects/${projectId}?tab=boards`}
      backLabel="Back to board"
      moduleLabel="Board"
    />
  );
}
