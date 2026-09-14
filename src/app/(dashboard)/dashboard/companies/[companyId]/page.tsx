import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { getDirectoryRecord, listDirectoryFlows } from "@/actions/module-record";
import { getAllLayoutCatalogs } from "@/actions/custom-field";
import { listWorkflowUsers } from "@/actions/workflow";
import { listContactOptions } from "@/actions/contact";
import { listCompanyOptions } from "@/actions/company";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { ModuleRecordForm } from "@/components/modules/module-record-form";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const { companyId } = await params;
  const [record, flows, catalogs, users, contacts, companies, related] =
    await Promise.all([
      getDirectoryRecord("company", companyId),
      listDirectoryFlows("company"),
      getAllLayoutCatalogs("company"),
      listWorkflowUsers(),
      listContactOptions(),
      listCompanyOptions(),
      listRelatedRecordOptions(),
    ]);
  if (!record) notFound();

  return (
    <ModuleRecordForm
      entityType="company"
      record={record}
      contacts={contacts}
      companies={companies}
      flows={flows}
      catalogs={catalogs}
      users={users}
      related={related}
    />
  );
}
