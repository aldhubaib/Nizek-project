import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { listWorkflows, listWorkflowUsers } from "@/actions/workflow";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { ensureProjectBoard } from "@/actions/board-record";
import { getFlowPermissions } from "@/lib/workflow-access";
import { ModuleRecordForm } from "@/components/modules/module-record-form";
import type { FlowDTO } from "@/lib/modules/types";

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ stage?: string; flow?: string }>;
}

export default async function NewBoardRecordPage({
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
  const [{ stage, flow }, workflows, catalogs, users] = await Promise.all([
    searchParams,
    listWorkflows("board", projectId),
    getAllLayoutCatalogs("board", projectId),
    listWorkflowUsers(projectId),
  ]);

  const flows: FlowDTO[] = workflows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    stageCount: row.statusCount,
    recordCount: row.recordCount,
    layoutId: row.layoutId,
    blueprintEnabled: row.blueprintEnabled,
  }));
  const flowId = flow ?? flows[0]?.id ?? null;
  const permissions = flowId ? await getFlowPermissions(flowId) : undefined;

  return (
    <ModuleRecordForm
      entityType="board"
      projectId={projectId}
      record={null}
      flows={flows}
      defaultFlowId={flowId}
      defaultStageId={stage ?? null}
      catalogs={catalogs}
      users={users}
      permissions={permissions}
    />
  );
}
