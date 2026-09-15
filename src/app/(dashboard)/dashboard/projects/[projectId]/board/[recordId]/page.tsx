import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { isProjectAccessError } from "@/lib/project-access";
import { listWorkflows, listWorkflowUsers } from "@/actions/workflow";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { ensureProjectBoard, getBoardRecord } from "@/actions/board-record";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { ModuleRecordForm } from "@/components/modules/module-record-form";
import { EMPTY_RELATED_CATALOG } from "@/lib/fields/relations";
import type { DealFlowDTO } from "@/actions/deal-flow";

export default async function BoardRecordPage({
  params,
}: {
  params: Promise<{ projectId: string; recordId: string }>;
}) {
  const { projectId, recordId } = await params;
  let userId: string;
  try {
    const { user } = await requireProjectMember(projectId);
    userId = user.id;
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }

  await ensureProjectBoard(projectId);
  const [record, workflows, catalogs, users, canContacts] = await Promise.all([
    getBoardRecord(projectId, recordId),
    listWorkflows("board", projectId),
    getAllLayoutCatalogs("board", projectId),
    listWorkflowUsers(),
    canAccessContacts(userId),
  ]);
  if (!record) notFound();

  const related = canContacts
    ? await listRelatedRecordOptions()
    : EMPTY_RELATED_CATALOG;

  const flows: DealFlowDTO[] = workflows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    stageCount: row.statusCount,
    dealCount: row.recordCount,
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
        value: null,
        flowId: record.flowId,
        stageId: record.stageId,
        contacts: [],
        companies: [],
        fieldValues: record.fieldValues,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        createdBy: record.createdBy,
        assignee: record.assignee,
      }}
      flows={flows}
      catalogs={catalogs}
      users={users}
      related={related}
    />
  );
}
