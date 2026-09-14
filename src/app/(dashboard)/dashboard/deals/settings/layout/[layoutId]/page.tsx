import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { getCustomFieldCatalog, listFormLayouts } from "@/actions/custom-field";
import { DealLayoutEditorClient } from "./deal-layout-editor-client";

export default async function DealLayoutEditorPage({
  params,
}: {
  params: Promise<{ layoutId: string }>;
}) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");

  const { layoutId } = await params;
  const layouts = await listFormLayouts("deal");
  const layout = layouts.find((item) => item.id === layoutId);
  if (!layout) notFound();

  const catalog = await getCustomFieldCatalog("deal", layoutId);
  return (
    <DealLayoutEditorClient
      layout={layout}
      catalog={catalog}
      canDelete={layouts.length > 1}
    />
  );
}
