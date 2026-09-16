"use client";

import { ModulePipelinePage } from "@/components/modules/module-pipeline-page";
import { moveDirectoryRecord } from "@/actions/module-record";
import { moduleSurface } from "@/lib/modules/registry";
import type { DealDTO } from "@/actions/deal";
import type { DealFlowDTO } from "@/actions/deal-flow";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { ContactOption } from "@/actions/contact";
import type { CompanyOption } from "@/actions/company";
import type { WorkflowTransitionDTO, WorkflowUserOption } from "@/actions/workflow";
import type { DealStageDTO } from "@/actions/deal-stage";
import type { RelatedRecordCatalog } from "@/lib/fields/relations";
import type { WorkflowPermissions } from "@/lib/workflow-permissions";

export function CompaniesPageClient(props: {
  flows: DealFlowDTO[];
  flowId: string | null;
  records: DealDTO[];
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
      surface={moduleSurface("company")}
      flows={props.flows}
      flowId={props.flowId}
      records={props.records}
      stages={props.stages}
      transitions={props.transitions}
      fields={props.fields}
      users={props.users}
      contacts={props.contacts}
      companies={props.companies}
      related={props.related}
      onMove={(id, stageId, payload) =>
        moveDirectoryRecord("company", id, stageId, payload)
      }
      permissions={props.permissions}
    />
  );
}
