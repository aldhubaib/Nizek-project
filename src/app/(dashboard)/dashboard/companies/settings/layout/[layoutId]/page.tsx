import { ModuleSettingsLayoutPage } from "@/components/modules/module-settings-pages";

export default async function CompaniesLayoutEditorPage({
  params,
}: {
  params: Promise<{ layoutId: string }>;
}) {
  const { layoutId } = await params;
  return <ModuleSettingsLayoutPage entityType="company" layoutId={layoutId} />;
}
