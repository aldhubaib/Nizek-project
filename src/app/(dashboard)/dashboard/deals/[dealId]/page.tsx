import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { getDeal } from "@/actions/deal";
import { listContactOptions } from "@/actions/contact";
import { listCompanyOptions } from "@/actions/company";
import { listDealFlows } from "@/actions/deal-flow";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { listWorkflowUsers } from "@/actions/workflow";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { DealForm } from "@/components/deals/deal-form";
import { getFlowPermissions } from "@/lib/workflow-access";

interface Props {
  params: Promise<{ dealId: string }>;
}

export default async function DealPage({ params }: Props) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const { dealId } = await params;
  const [deal, contacts, companies, flows, catalogs, users, related] =
    await Promise.all([
      getDeal(dealId),
      listContactOptions(),
      listCompanyOptions(),
      listDealFlows(),
      getAllLayoutCatalogs("deal"),
      listWorkflowUsers(),
      listRelatedRecordOptions({ excludeDealId: dealId }),
    ]);
  if (!deal) notFound();

  return (
    <DealForm
      deal={deal}
      contacts={contacts}
      companies={companies}
      flows={flows}
      catalogs={catalogs}
      users={users}
      related={related}
      permissions={await getFlowPermissions(deal.flowId)}
    />
  );
}
