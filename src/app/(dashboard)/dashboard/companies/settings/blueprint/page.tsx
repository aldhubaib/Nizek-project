import { ModuleSettingsBlueprintPage } from "@/components/modules/module-settings-pages";

export default async function CompaniesBlueprintPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>;
}) {
  const { flow } = await searchParams;
  return <ModuleSettingsBlueprintPage entityType="company" flow={flow} />;
}
