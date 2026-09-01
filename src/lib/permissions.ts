import { STAGE_ORDER, WORK_STAGES } from "@/lib/task-stage";

export interface ProjectRolePermissions {
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  canCreateSprintPlanning: boolean;
  canStartSprint: boolean;
  canEndSprint: boolean;
  canDeleteSprint: boolean;
  canMoveTask: boolean;
  canViewTaskHistory: boolean;
  allowedTransitions: Record<string, string[]>;
  modifyStages: string[];
}

export function parseTransitions(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function canTransition(
  permissions: Pick<
    ProjectRolePermissions,
    "isAdmin" | "canMoveTask" | "allowedTransitions"
  >,
  fromStage: string,
  toStage: string,
): boolean {
  if (permissions.isAdmin) return true;
  if (!permissions.canMoveTask) return false;
  const allowed = permissions.allowedTransitions[fromStage];
  if (!allowed) return false;
  return allowed.includes(toStage);
}

export function canModifyInStage(
  permissions: ProjectRolePermissions,
  stage: string,
): boolean {
  if (permissions.isAdmin) return true;
  if (!permissions.canModifyTask) return false;
  return permissions.modifyStages.includes(stage);
}

export function getPermissionsFromRole(role: {
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canDeleteTask?: boolean;
  canDeclineTask?: boolean;
  canCreateSprintPlanning?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  canDeleteSprint?: boolean;
  canMoveTask: boolean;
  canViewTaskHistory?: boolean;
  allowedTransitions?: string | null;
  allowedStages?: string | null;
} | null): ProjectRolePermissions {
  if (!role) {
    return {
      isAdmin: false,
      canCreateTask: false,
      canModifyTask: false,
      canDeleteTask: false,
      canDeclineTask: false,
      canCreateSprintPlanning: false,
      canStartSprint: false,
      canEndSprint: false,
      canDeleteSprint: false,
      canMoveTask: false,
      canViewTaskHistory: false,
      allowedTransitions: {},
      modifyStages: [],
    };
  }

  let allData = parseTransitions(role.allowedTransitions ?? null);
  if (Object.keys(allData).length === 0 && role.allowedStages) {
    allData = migrateStagesToTransitions(role.allowedStages);
  }

  // `_create` is only still read so roles saved before create collapsed into a
  // single flag keep the right to create. Nothing writes it any more.
  const legacyCreateStages: string[] = (allData as Record<string, unknown>)["_create"] as string[] ?? [];
  const modifyStages: string[] = (allData as Record<string, unknown>)["_modify"] as string[] ?? [];

  const transitions: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(allData)) {
    if (!key.startsWith("_")) {
      transitions[key] = val;
    }
  }

  const hasCreateStages = legacyCreateStages.length > 0;
  const hasModifyStages = modifyStages.length > 0;
  // Having any configured transition implies move permission. The roles UI
  // has no explicit "can move" toggle — it only sets the flag as a side
  // effect of checking a Forward/Rollback box — so roles saved with
  // transitions but canMoveTask=false would otherwise deny every move.
  const hasTransitions = Object.keys(transitions).length > 0;

  return {
    isAdmin: role.isAdmin,
    canCreateTask: hasCreateStages || role.canCreateTask,
    canModifyTask: hasModifyStages || role.canModifyTask,
    canDeleteTask: role.canDeleteTask ?? false,
    canDeclineTask: role.canDeclineTask ?? false,
    canCreateSprintPlanning: role.canCreateSprintPlanning ?? false,
    canStartSprint: role.canStartSprint ?? false,
    canEndSprint: role.canEndSprint ?? false,
    canDeleteSprint: role.canDeleteSprint ?? false,
    canMoveTask: hasTransitions || role.canMoveTask,
    canViewTaskHistory: role.canViewTaskHistory ?? false,
    allowedTransitions: transitions,
    modifyStages: hasModifyStages ? modifyStages : (role.canModifyTask ? [...STAGE_ORDER] : []),
  };
}

/**
 * The stages a person can move a task between by hand. Planned, Next, Completed
 * and Shipped are projections of the sprint, so they are reached by moving the
 * sprint, never by dragging a card — granting a role permission over them would
 * describe a move that cannot happen.
 *
 * This is only about moving. A task parked in one of those stages is still
 * edited like any other, which is why modify covers every stage.
 */
export const MOVABLE_STAGE_IDS: string[] = ["BACKLOG", ...WORK_STAGES];

function migrateStagesToTransitions(
  allowedStages: string | null,
): Record<string, string[]> {
  if (!allowedStages) return {};
  try {
    const stages: string[] = JSON.parse(allowedStages);
    const transitions: Record<string, string[]> = {};
    for (const from of MOVABLE_STAGE_IDS) {
      const targets = stages.filter((s) => s !== from);
      if (targets.length > 0) transitions[from] = targets;
    }
    return transitions;
  } catch {
    return {};
  }
}

export function getAdminPermissions(): ProjectRolePermissions {
  return {
    isAdmin: true,
    canCreateTask: true,
    canModifyTask: true,
    canDeleteTask: true,
    canDeclineTask: true,
    canCreateSprintPlanning: true,
    canStartSprint: true,
    canEndSprint: true,
    canDeleteSprint: true,
    canMoveTask: true,
    canViewTaskHistory: true,
    allowedTransitions: {},
    modifyStages: [...STAGE_ORDER],
  };
}

export type SprintAction = "createPlanning" | "start" | "end" | "delete";

export function canSprint(
  permissions: Pick<
    ProjectRolePermissions,
    | "isAdmin"
    | "canCreateSprintPlanning"
    | "canStartSprint"
    | "canEndSprint"
    | "canDeleteSprint"
  >,
  action: SprintAction,
): boolean {
  if (permissions.isAdmin) return true;
  if (action === "createPlanning") return permissions.canCreateSprintPlanning;
  if (action === "start") return permissions.canStartSprint;
  if (action === "end") return permissions.canEndSprint;
  return permissions.canDeleteSprint;
}
