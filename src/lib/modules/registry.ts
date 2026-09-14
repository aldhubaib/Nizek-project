import type { CustomFieldType } from "@/lib/fields/types";
import type { RelationModel } from "@/lib/fields/relations";
import {
  WORKFLOW_ENTITY_TYPES,
  type WorkflowEntityType,
} from "@/lib/workflow/types";

export type ModuleBinding = {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  relation?: { model: RelationModel; multiple: boolean };
};

export type ModuleDef = {
  id: WorkflowEntityType;
  label: string;
  settingsPath: string;
  recordPath: string;
  revalidatePaths: string[];
  bindings: ModuleBinding[];
};

export const MODULES: Record<WorkflowEntityType, ModuleDef> = {
  deal: {
    id: "deal",
    label: "Deals",
    settingsPath: "/dashboard/deals/settings",
    recordPath: "/dashboard/deals",
    revalidatePaths: [
      "/dashboard/deals",
      "/dashboard/deals/settings",
      "/dashboard/deals/settings/blueprint",
      "/dashboard/deals/settings/layout",
      "/dashboard/deals/settings/flows",
      "/dashboard/deals/new",
    ],
    bindings: [
      { key: "title", label: "Title", type: "text", required: true },
    ],
  },
  contact: {
    id: "contact",
    label: "Contacts",
    settingsPath: "/dashboard/contacts/settings",
    recordPath: "/dashboard/contacts",
    revalidatePaths: [
      "/dashboard/contacts",
      "/dashboard/contacts/settings",
      "/dashboard/contacts/settings/blueprint",
      "/dashboard/contacts/settings/layout",
      "/dashboard/contacts/settings/flows",
      "/dashboard/contacts/new",
    ],
    bindings: [
      { key: "title", label: "Name", type: "text", required: true },
    ],
  },
  company: {
    id: "company",
    label: "Companies",
    settingsPath: "/dashboard/companies/settings",
    recordPath: "/dashboard/companies",
    revalidatePaths: [
      "/dashboard/companies",
      "/dashboard/companies/settings",
      "/dashboard/companies/settings/blueprint",
      "/dashboard/companies/settings/layout",
      "/dashboard/companies/settings/flows",
      "/dashboard/companies/new",
    ],
    bindings: [
      { key: "title", label: "Name", type: "text", required: true },
    ],
  },
  board: {
    id: "board",
    label: "Board",
    settingsPath: "/dashboard/projects",
    recordPath: "/dashboard/projects",
    // Board routes only — never the project page. Sprints, tasks, and the
    // Road map live there and stay on their own cache.
    revalidatePaths: [],
    bindings: [
      { key: "title", label: "Title", type: "text", required: true },
    ],
  },
};

export type ModuleSurface = {
  entityType: WorkflowEntityType;
  projectId?: string;
  label: string;
  recordWord: string;
  basePath: string;
  settingsPath: string;
  embedded?: boolean;
};

export function moduleSurface(
  entityType: WorkflowEntityType,
  projectId = "",
): ModuleSurface {
  if (entityType === "board") {
    const base = `/dashboard/projects/${projectId}/board`;
    return {
      entityType,
      projectId,
      label: "Board",
      recordWord: "card",
      basePath: `${projectId ? `/dashboard/projects/${projectId}?tab=boards` : "/dashboard/projects"}`,
      settingsPath: `${base}/settings`,
      embedded: true,
    };
  }
  const mod = getModule(entityType);
  const recordWord =
    entityType === "contact" ? "contact" : entityType === "company" ? "company" : "deal";
  return {
    entityType,
    label: mod.label,
    recordWord,
    basePath: mod.recordPath,
    settingsPath: mod.settingsPath,
  };
}

/** Cache keys for the configurable project Board. Not the sprint kanban. */
export function projectBoardPaths(projectId: string): string[] {
  const base = `/dashboard/projects/${projectId}/board`;
  return [
    `${base}/settings`,
    `${base}/settings/flows`,
    `${base}/settings/blueprint`,
    `${base}/settings/layout`,
    `${base}/new`,
  ];
}

export function isModuleId(value: string): value is WorkflowEntityType {
  return (WORKFLOW_ENTITY_TYPES as readonly string[]).includes(value);
}

export function getModule(id: string): ModuleDef {
  return isModuleId(id) ? MODULES[id] : MODULES.deal;
}

export function moduleBinding(entityType: string, key: string): ModuleBinding | undefined {
  return getModule(entityType).bindings.find((binding) => binding.key === key);
}

export function isModuleBindingKey(id: string): boolean {
  return Object.values(MODULES).some((mod) =>
    mod.bindings.some((binding) => binding.key === id),
  );
}

export function moduleBindingLabel(id: string): string {
  for (const mod of Object.values(MODULES)) {
    const binding = mod.bindings.find((row) => row.key === id);
    if (binding) return binding.label;
  }
  return id;
}
