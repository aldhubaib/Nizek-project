import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { listDirectoryFlows } from "@/actions/module-record";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { listWorkflowUsers } from "@/actions/workflow";
import { listContactOptions } from "@/actions/contact";
import { listCompanyOptions } from "@/actions/company";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { ModuleRecordForm } from "@/components/modules/module-record-form";

interface Props {
  searchParams: Promise<{ stage?: string; flow?: string }>;
}

export default async function NewCompanyPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const [{ stage, flow }, flows, catalogs, users, contacts, companies, related] =
    await Promise.all([
      searchParams,
      listDirectoryFlows("company"),
      getAllLayoutCatalogs("company"),
      listWorkflowUsers(),
      listContactOptions(),
      listCompanyOptions(),
      listRelatedRecordOptions(),
    ]);

  return (
    <ModuleRecordForm
      entityType="company"
      record={null}
      contacts={contacts}
      companies={companies}
      flows={flows}
      defaultFlowId={flow ?? flows[0]?.id ?? null}
      defaultStageId={stage ?? null}
      catalogs={catalogs}
      users={users}
      related={related}
    />
  );
}
