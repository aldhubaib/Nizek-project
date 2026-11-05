import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { isProjectAccessError } from "@/lib/project-access";
import { listWorkflows, listWorkflowUsers } from "@/actions/workflow";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { ensureProjectBoard, getBoardRecord } from "@/actions/board-record";
import { getFlowPermissions } from "@/lib/workflow-access";
import { ModuleRecordForm } from "@/components/modules/module-record-form";
import type { FlowDTO } from "@/lib/modules/types";

export default async function BoardRecordPage({
  params,
}: {
  params: Promise<{ projectId: string; recordId: string }>;
}) {
  const { projectId, recordId } = await params;
  try {
    await requireProjectMember(projectId);
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }

  await ensureProjectBoard(projectId);
  const [record, workflows, catalogs, users] = await Promise.all([
    getBoardRecord(projectId, recordId),
    listWorkflows("board", projectId),
    getAllLayoutCatalogs("board", projectId),
    listWorkflowUsers(projectId),
  ]);
  if (!record) notFound();

  const flows: FlowDTO[] = workflows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    stageCount: row.statusCount,
    recordCount: row.recordCount,
    layoutId: row.layoutId,
    blueprintEnabled: row.blueprintEnabled,
  }));

  return (
    <ModuleRecordForm
      entityType="board"
      projectId={projectId}
      record={{
        id: record.id,
        recordNumber: record.recordNumber,
        title: record.title,
        flowId: record.flowId,
        stageId: record.stageId,
        fieldValues: record.fieldValues,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        createdBy: record.createdBy,
        assignee: record.assignee,
      }}
      flows={flows}
      catalogs={catalogs}
      users={users}
      permissions={await getFlowPermissions(record.flowId)}
    />
  );
}
