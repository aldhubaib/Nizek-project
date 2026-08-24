export interface ProjectRolePermissions {
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  canMoveTask: boolean;
  allowedTransitions: Record<string, string[]>;
  createStages: string[];
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
  if (allowed.includes(toStage)) return true;
  // Bugs skip Client Review and go straight to Done, so being allowed
  // forward out of Internal Review covers that lane too.
  return (
    fromStage === "INTERNAL_REVIEW" &&
    toStage === "DONE" &&
    allowed.includes("CLIENT_REVIEW")
  );
}

export function canCreateInStage(
  permissions: ProjectRolePermissions,
  stage: string,
): boolean {
  if (permissions.isAdmin) return true;
  if (!permissions.canCreateTask) return false;
  return permissions.createStages.includes(stage);
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
  canMoveTask: boolean;
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
      canMoveTask: false,
      allowedTransitions: {},
      createStages: [],
      modifyStages: [],
    };
  }

  let allData = parseTransitions(role.allowedTransitions ?? null);
  if (Object.keys(allData).length === 0 && role.allowedStages) {
    allData = migrateStagesToTransitions(role.allowedStages);
  }

  const createStages: string[] = (allData as Record<string, unknown>)["_create"] as string[] ?? [];
  const modifyStages: string[] = (allData as Record<string, unknown>)["_modify"] as string[] ?? [];

  const transitions: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(allData)) {
    if (!key.startsWith("_")) {
      transitions[key] = val;
    }
  }

  const hasCreateStages = createStages.length > 0;
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
    canMoveTask: hasTransitions || role.canMoveTask,
    allowedTransitions: transitions,
    createStages: hasCreateStages ? createStages : (role.canCreateTask ? ALL_STAGE_IDS : []),
    modifyStages: hasModifyStages ? modifyStages : (role.canModifyTask ? ALL_STAGE_IDS : []),
  };
}

const ALL_STAGE_IDS = [
  "BACKLOG",
  "CLARIFICATION",
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "CLIENT_REVIEW",
  "DONE",
];

function migrateStagesToTransitions(
  allowedStages: string | null,
): Record<string, string[]> {
  if (!allowedStages) return {};
  try {
    const stages: string[] = JSON.parse(allowedStages);
    const transitions: Record<string, string[]> = {};
    for (const from of ALL_STAGE_IDS) {
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
    canMoveTask: true,
    allowedTransitions: {},
    createStages: ALL_STAGE_IDS,
    modifyStages: ALL_STAGE_IDS,
  };
}
