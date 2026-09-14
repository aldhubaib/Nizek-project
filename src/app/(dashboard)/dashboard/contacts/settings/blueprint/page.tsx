import { ModuleSettingsBlueprintPage } from "@/components/modules/module-settings-pages";

export default async function ContactsBlueprintPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow } = await searchParams;
  return <ModuleSettingsBlueprintPage entityType="contact" flow={flow} />;
}
