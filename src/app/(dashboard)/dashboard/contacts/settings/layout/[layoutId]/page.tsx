import { ModuleSettingsLayoutPage } from "@/components/modules/module-settings-pages";

export default async function ContactsLayoutEditorPage({
  params,
}: {
  params: Promise<{ layoutId: string }>;
}) {
  const { layoutId } = await params;
  return <ModuleSettingsLayoutPage entityType="contact" layoutId={layoutId} />;
}
