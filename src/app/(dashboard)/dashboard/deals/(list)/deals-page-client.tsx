"use client";

import { ModulePipelinePage } from "@/components/modules/module-pipeline-page";
import { moveDealToStage } from "@/actions/deal-stage";
import { moduleSurface } from "@/lib/modules/registry";
import type { DealDTO } from "@/actions/deal";
import type { DealFlowDTO } from "@/actions/deal-flow";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { ContactOption } from "@/actions/contact";
import type { CompanyOption } from "@/actions/company";
import type { WorkflowTransitionDTO, WorkflowUserOption } from "@/actions/workflow";
import type { DealStageDTO } from "@/actions/deal-stage";
import {
  EMPTY_RELATED_CATALOG,
  type RelatedRecordCatalog,
} from "@/lib/fields/relations";
import type { WorkflowPermissions } from "@/lib/workflow-permissions";

export function DealsPageClient({
  flows,
  flowId,
  deals,
  stages,
  transitions,
  fields,
  users,
  contacts,
  companies,
  related = EMPTY_RELATED_CATALOG,
  permissions,
}: {
  flows: DealFlowDTO[];
  flowId: string | null;
  deals: DealDTO[];
  stages: DealStageDTO[];
  transitions: WorkflowTransitionDTO[];
  fields: CustomFieldDTO[];
  users: WorkflowUserOption[];
  contacts: ContactOption[];
  companies: CompanyOption[];
  related?: RelatedRecordCatalog;
  permissions?: WorkflowPermissions;
}) {
  return (
    <ModulePipelinePage
      surface={moduleSurface("deal")}
      flows={flows}
      flowId={flowId}
      records={deals}
      stages={stages}
      transitions={transitions}
      fields={fields}
      users={users}
      contacts={contacts}
      companies={companies}
      related={related}
      onMove={moveDealToStage}
      permissions={permissions}
    />
  );
}
