import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { listCompanies } from "@/actions/company";
import { CompaniesPageClient } from "./companies-page-client";

export default async function CompaniesPage() {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const companies = await listCompanies();

  return <CompaniesPageClient companies={companies} />;
}
