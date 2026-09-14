import { redirect } from "next/navigation";

export default function ContactsLayoutIndexPage() {
  redirect("/dashboard/contacts/settings#layout");
}
