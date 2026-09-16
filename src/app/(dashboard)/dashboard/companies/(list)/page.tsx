import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { getDirectoryPipeline } from "@/actions/module-record";
import { listContactOptions } from "@/actions/contact";
import { listCompanyOptions } from "@/actions/company";
import { listRelatedRecordOptions } from "@/actions/related-records";
import { CompaniesPageClient } from "./companies-page-client";

interface Props {
  searchParams: Promise<{ flow?: string }>;
}

export default async function CompaniesPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const { flow } = await searchParams;
  const [pipeline, contacts, companies, related] = await Promise.all([
    getDirectoryPipeline("company", flow),
    listContactOptions(),
    listCompanyOptions(),
    listRelatedRecordOptions(),
  ]);

  return (
    <CompaniesPageClient
      flows={pipeline.flows}
      flowId={pipeline.flowId}
      records={pipeline.records}
      stages={pipeline.stages}
      transitions={pipeline.transitions}
      fields={pipeline.fields}
      users={pipeline.users}
      contacts={contacts}
      companies={companies}
      related={related}
      permissions={pipeline.permissions}
    />
  );
}
