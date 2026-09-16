import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { getWorkflowSettings, listWorkflowUsers } from "@/actions/workflow";
import { listModuleRoles } from "@/actions/workflow-role";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { ensureProjectBoard } from "@/actions/board-record";
import { DealSettingsClient } from "@/app/(dashboard)/dashboard/deals/settings/deal-settings-client";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ flow?: string }>;
};

export default async function ProjectBoardBlueprintPage({
  params,
  searchParams,
}: Props) {
  const { projectId } = await params;
  try {
    await requireProjectMember(projectId);
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }

  await ensureProjectBoard(projectId);
  const { flow } = await searchParams;
  const [settings, catalogs, users, roles] = await Promise.all([
    getWorkflowSettings("board", projectId),
    getAllLayoutCatalogs("board", projectId),
    listWorkflowUsers(projectId),
    listModuleRoles("board", projectId),
  ]);

  return (
    <DealSettingsClient
      initial={settings}
      catalogs={catalogs}
      users={users}
      roles={roles}
      initialFlowId={flow}
      basePath={`/dashboard/projects/${projectId}/board/settings`}
    />
  );
}
