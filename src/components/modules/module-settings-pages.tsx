import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessContacts } from "@/lib/contacts-access";
import { getWorkflowSettings, listWorkflowUsers, listWorkflows } from "@/actions/workflow";
import { listModuleRoles } from "@/actions/workflow-role";
import {
  getAllLayoutCatalogs,
  getCustomFieldCatalog,
  listFormLayouts,
} from "@/actions/custom-field";
import { ensureDirectoryWorkflow, type DirectoryEntity } from "@/actions/module-record";
import { getModule } from "@/lib/modules/registry";
import { DealSettingsHub } from "@/app/(dashboard)/dashboard/deals/settings/deal-settings-hub";
import { DealSettingsClient } from "@/app/(dashboard)/dashboard/deals/settings/deal-settings-client";
import { DealFlowsClient } from "@/app/(dashboard)/dashboard/deals/settings/flows/deal-flows-client";
import { DealLayoutEditorClient } from "@/app/(dashboard)/dashboard/deals/settings/layout/[layoutId]/deal-layout-editor-client";
import { WorkflowRolesManager } from "@/components/workflow/workflow-roles-manager";

async function requireDirectory(entityType: DirectoryEntity) {
  const user = await requireUser();
  if (!(await canAccessContacts(user.id))) redirect("/dashboard");
  await ensureDirectoryWorkflow(entityType);
  return getModule(entityType);
}

export async function ModuleSettingsHubPage({
  entityType,
}: {
  entityType: DirectoryEntity;
}) {
  const mod = await requireDirectory(entityType);
  const [flows, layouts] = await Promise.all([
    listWorkflows(entityType),
    listFormLayouts(entityType),
  ]);
  return (
    <DealSettingsHub
      flows={flows}
      layouts={layouts}
      entityType={entityType}
      basePath={mod.settingsPath}
      backHref={mod.recordPath}
      backLabel={`Back to ${mod.label.toLowerCase()}`}
      moduleLabel={mod.label}
    />
  );
}

export async function ModuleSettingsFlowsPage({
  entityType,
}: {
  entityType: DirectoryEntity;
}) {
  const mod = await requireDirectory(entityType);
  const [settings, layouts] = await Promise.all([
    getWorkflowSettings(entityType),
    listFormLayouts(entityType),
  ]);
  return (
    <DealFlowsClient
      initial={settings.workflows}
      layouts={layouts}
      entityType={entityType}
      basePath={mod.settingsPath}
    />
  );
}

export async function ModuleSettingsBlueprintPage({
  entityType,
  flow,
}: {
  entityType: DirectoryEntity;
  flow?: string;
}) {
  const mod = await requireDirectory(entityType);
  const [settings, catalogs, users, roles] = await Promise.all([
    getWorkflowSettings(entityType),
    getAllLayoutCatalogs(entityType),
    listWorkflowUsers(),
    listModuleRoles(entityType),
  ]);
  return (
    <DealSettingsClient
      initial={settings}
      catalogs={catalogs}
      users={users}
      roles={roles}
      initialFlowId={flow}
      basePath={mod.settingsPath}
    />
  );
}

export async function ModuleSettingsRolesPage({
  entityType,
}: {
  entityType: DirectoryEntity;
}) {
  const mod = await requireDirectory(entityType);
  return (
    <WorkflowRolesManager
      entityType={entityType}
      backHref={mod.settingsPath}
      backLabel="Back to settings"
      title={`${mod.label} roles`}
    />
  );
}

export async function ModuleSettingsLayoutPage({
  entityType,
  layoutId,
}: {
  entityType: DirectoryEntity;
  layoutId: string;
}) {
  const mod = await requireDirectory(entityType);
  const layouts = await listFormLayouts(entityType);
  const layout = layouts.find((item) => item.id === layoutId);
  if (!layout) notFound();
  const catalog = await getCustomFieldCatalog(entityType, layoutId);
  return (
    <DealLayoutEditorClient
      layout={layout}
      catalog={catalog}
      canDelete={layouts.length > 1}
      entityType={entityType}
      backHref={mod.settingsPath}
    />
  );
}
