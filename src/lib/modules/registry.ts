import type { CustomFieldType } from "@/lib/fields/types";
import {
  WORKFLOW_ENTITY_TYPES,
  type WorkflowEntityType,
} from "@/lib/workflow/types";

export type ModuleBinding = {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
};

export type ModuleDef = {
  id: WorkflowEntityType;
  label: string;
  settingsPath: string;
  recordPath: string;
  revalidatePaths: string[];
  bindings: ModuleBinding[];
};

/** The one module left on the engine: the per-project Board. */
export const MODULES: Record<WorkflowEntityType, ModuleDef> = {
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
  return isModuleId(id) ? MODULES[id] : MODULES.board;
}

export function moduleBinding(entityType: string, key: string): ModuleBinding | undefined {
  return getModule(entityType).bindings.find((binding) => binding.key === key);
}

export function isModuleBindingKey(id: string): boolean {
  return Object.values(MODULES).some((mod) =>
    mod.bindings.some((binding) => binding.key === id),
  );
}
