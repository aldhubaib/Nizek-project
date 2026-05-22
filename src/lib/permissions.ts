export interface ProjectRolePermissions {
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  canMoveTask: boolean;
  allowedTransitions: Record<string, string[]>;
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
  permissions: ProjectRolePermissions,
  fromStage: string,
  toStage: string,
): boolean {
  if (permissions.isAdmin) return true;
  if (!permissions.canMoveTask) return false;
  const allowed = permissions.allowedTransitions[fromStage];
  return allowed ? allowed.includes(toStage) : false;
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
    };
  }

  let transitions = parseTransitions(role.allowedTransitions ?? null);
  if (Object.keys(transitions).length === 0 && role.allowedStages) {
    transitions = migrateStagesToTransitions(role.allowedStages);
  }

  return {
    isAdmin: role.isAdmin,
    canCreateTask: role.canCreateTask,
    canModifyTask: role.canModifyTask,
    canDeleteTask: role.canDeleteTask ?? false,
    canDeclineTask: role.canDeclineTask ?? false,
    canMoveTask: role.canMoveTask,
    allowedTransitions: transitions,
  };
}

function migrateStagesToTransitions(
  allowedStages: string | null,
): Record<string, string[]> {
  if (!allowedStages) return {};
  try {
    const stages: string[] = JSON.parse(allowedStages);
    const ALL_STAGES = [
      "NEW_REQUEST",
      "CLARIFICATION",
      "READY_FOR_DEV",
      "IN_DEVELOPMENT",
      "INTERNAL_REVIEW",
      "CLIENT_REVIEW",
      "READY_FOR_RELEASE",
      "DONE",
    ];
    const transitions: Record<string, string[]> = {};
    for (const from of ALL_STAGES) {
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
  };
}
