import { notFound } from "next/navigation";
import { requireProjectMember } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { isProjectAccessError } from "@/lib/project-access";
import { listWorkflows, listWorkflowUsers } from "@/actions/workflow";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { ensureProjectBoard } from "@/actions/board-record";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { ModuleRecordForm } from "@/components/modules/module-record-form";
import { EMPTY_RELATED_CATALOG } from "@/lib/fields/relations";
import type { DealFlowDTO } from "@/actions/deal-flow";

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ stage?: string; flow?: string }>;
}

export default async function NewBoardRecordPage({
  params,
  searchParams,
}: Props) {
  const { projectId } = await params;
  let userId: string;
  try {
    const { user } = await requireProjectMember(projectId);
    userId = user.id;
  } catch (err) {
    if (isProjectAccessError(err)) notFound();
    throw err;
  }

  await ensureProjectBoard(projectId);
  const [{ stage, flow }, workflows, catalogs, users, canContacts] =
    await Promise.all([
      searchParams,
      listWorkflows("board", projectId),
      getAllLayoutCatalogs("board", projectId),
      listWorkflowUsers(),
      canAccessContacts(userId),
    ]);
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
      record={null}
      flows={flows}
      defaultFlowId={flow ?? flows[0]?.id ?? null}
      defaultStageId={stage ?? null}
      catalogs={catalogs}
      users={users}
      related={related}
    />
  );
}
