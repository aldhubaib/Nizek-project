import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { listContacts } from "@/actions/contact";
import { listCompanyOptions } from "@/actions/company";
import { listContactStages } from "@/actions/contact-stage";
import { ContactsPageClient } from "./contacts-page-client";

export default async function ContactsPage() {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const [contacts, companies, stages] = await Promise.all([
    listContacts(),
    listCompanyOptions(),
    listContactStages(),
  ]);

  return (
    <ContactsPageClient
      contacts={contacts}
      companies={companies}
      stages={stages}
    />
  );
}
