import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { listFormLayouts } from "@/actions/custom-field";
import { DealLayoutList } from "./deal-layout-list";

export default async function DealLayoutPage() {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const layouts = await listFormLayouts("deal");
  return <DealLayoutList layouts={layouts} />;
}
