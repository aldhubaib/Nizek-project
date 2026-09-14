import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { getCustomFieldCatalog, listFormLayouts } from "@/actions/custom-field";
import { ensureProjectBoard } from "@/actions/board-record";
import { DealLayoutEditorClient } from "@/app/(dashboard)/dashboard/deals/settings/layout/[layoutId]/deal-layout-editor-client";

export default async function ProjectBoardLayoutEditorPage({
  params,
}: {
  params: Promise<{ projectId: string; layoutId: string }>;
}) {
  const { projectId, layoutId } = await params;
  try {
    await requireProjectMember(projectId);
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }

  await ensureProjectBoard(projectId);
  const layouts = await listFormLayouts("board", projectId);
  const layout = layouts.find((item) => item.id === layoutId);
  if (!layout) notFound();

  const catalog = await getCustomFieldCatalog("board", layoutId, projectId);
  return (
    <DealLayoutEditorClient
      layout={layout}
      catalog={catalog}
      canDelete={layouts.length > 1}
      entityType="board"
      backHref={`/dashboard/projects/${projectId}/board/settings`}
    />
  );
}
