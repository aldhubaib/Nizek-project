"use client";

import { ModuleRecordForm } from "@/components/modules/module-record-form";
import type { DealDTO } from "@/actions/deal";
import type { ContactOption } from "@/actions/contact";
import type { CompanyOption } from "@/actions/company";
import type { DealFlowDTO } from "@/actions/deal-flow";
import type { CustomFieldCatalogDTO } from "@/actions/custom-field";
import type { WorkflowUserOption } from "@/actions/workflow";
import type { RelatedRecordCatalog } from "@/lib/fields/relations";

export function DealForm(
  props: {
    deal: DealDTO | null;
    contacts: ContactOption[];
    companies: CompanyOption[];
    flows: DealFlowDTO[];
    defaultFlowId?: string | null;
    defaultStageId?: string | null;
    catalogs: Record<string, CustomFieldCatalogDTO>;
    users: WorkflowUserOption[];
    related?: RelatedRecordCatalog;
  },
) {
  return (
    <ModuleRecordForm
      entityType="deal"
      record={props.deal}
      contacts={props.contacts}
      companies={props.companies}
      flows={props.flows}
      defaultFlowId={props.defaultFlowId}
      defaultStageId={props.defaultStageId}
      catalogs={props.catalogs}
      users={props.users}
      related={props.related}
    />
  );
}
