import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { listDeals } from "@/actions/deal";
import { listDealFlows } from "@/actions/deal-flow";
import { listDealStages, listDealTransitionGraph } from "@/actions/deal-stage";
import { listCustomFields } from "@/actions/custom-field";
import { listWorkflowUsers } from "@/actions/workflow";
import { listContactOptions } from "@/actions/contact";
import { listCompanyOptions } from "@/actions/company";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { EMPTY_RELATED_CATALOG } from "@/lib/fields/relations";
import { DealsPageClient } from "./deals-page-client";

interface Props {
  searchParams: Promise<{ flow?: string }>;
}

export default async function DealsPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const { flow: requested } = await searchParams;
  const flows = await listDealFlows();
  const flow = flows.find((f) => f.id === requested) ?? flows[0] ?? null;

  const [deals, stages, transitions, fields, users, contacts, companies, related] =
    flow
      ? await Promise.all([
          listDeals(flow.id),
          listDealStages(flow.id),
          listDealTransitionGraph(flow.id),
          listCustomFields("deal", flow.layoutId),
          listWorkflowUsers(),
          listContactOptions(),
          listCompanyOptions(),
          listRelatedRecordOptions(),
        ])
      : [[], [], [], [], [], [], [], EMPTY_RELATED_CATALOG];

  return (
    <DealsPageClient
      flows={flows}
      flowId={flow?.id ?? null}
      deals={deals}
      stages={stages}
      transitions={transitions}
      fields={fields}
      users={users}
      contacts={contacts}
      companies={companies}
      related={related}
    />
  );
}
