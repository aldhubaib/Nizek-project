import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { listContactOptions } from "@/actions/contact";
import { listCompanyOptions } from "@/actions/company";
import { listDealFlows } from "@/actions/deal-flow";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { listWorkflowUsers } from "@/actions/workflow";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { DealForm } from "@/components/deals/deal-form";
import { getFlowPermissions } from "@/lib/workflow-access";

interface Props {
  searchParams: Promise<{ stage?: string; flow?: string }>;
}

export default async function NewDealPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const [{ stage, flow }, contacts, companies, flows, catalogs, users, related] =
    await Promise.all([
      searchParams,
      listContactOptions(),
      listCompanyOptions(),
      listDealFlows(),
      getAllLayoutCatalogs("deal"),
      listWorkflowUsers(),
      listRelatedRecordOptions(),
    ]);

  return (
    <DealForm
      deal={null}
      contacts={contacts}
      companies={companies}
      flows={flows}
      defaultFlowId={flow ?? flows[0]?.id ?? null}
      defaultStageId={stage ?? null}
      catalogs={catalogs}
      users={users}
      related={related}
      permissions={
        (flow ?? flows[0]?.id)
          ? await getFlowPermissions(flow ?? flows[0]!.id)
          : undefined
      }
    />
  );
}
