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
  // forward out of Internal Review covers that lane too. Checked here
  // rather than trusting the stored role, which may predate the shortcut.
  if (
    fromStage === "INTERNAL_REVIEW" &&
    toStage === "DONE" &&
    (allowed.includes("CLIENT_REVIEW") || allowed.includes("READY_FOR_RELEASE"))
  ) {
    return true;
  }
  // Ready for Release was removed from the board; Client Review now
  // forwards to Done. Roles that still store the old next-stage still work.
  if (
    fromStage === "CLIENT_REVIEW" &&
    toStage === "DONE" &&
    allowed.includes("READY_FOR_RELEASE")
  ) {
    return true;
  }
  // Clarification was removed from the board; Backlog now forwards to
  // Ready for Dev. Roles that still store the old next-stage still work.
  if (
    fromStage === "NEW_REQUEST" &&
    toStage === "READY_FOR_DEV" &&
    allowed.includes("CLARIFICATION")
  ) {
    return true;
  }
  if (
    fromStage === "READY_FOR_DEV" &&
    toStage === "NEW_REQUEST" &&
    allowed.includes("CLARIFICATION")
  ) {
    return true;
  }
  return (
    fromStage === "INTERNAL_REVIEW" &&
    toStage === "READY_FOR_RELEASE" &&
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
  canCreateSprintPlanning?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  canDeleteSprint?: boolean;
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
      canCreateSprintPlanning: false,
      canStartSprint: false,
      canEndSprint: false,
      canDeleteSprint: false,
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
    canCreateSprintPlanning: role.canCreateSprintPlanning ?? false,
    canStartSprint: role.canStartSprint ?? false,
    canEndSprint: role.canEndSprint ?? false,
    canDeleteSprint: role.canDeleteSprint ?? false,
    canMoveTask: hasTransitions || role.canMoveTask,
    allowedTransitions: transitions,
    createStages: hasCreateStages ? createStages : (role.canCreateTask ? ALL_STAGE_IDS : []),
    modifyStages: hasModifyStages ? modifyStages : (role.canModifyTask ? ALL_STAGE_IDS : []),
  };
}

const ALL_STAGE_IDS = [
  "NEW_REQUEST",
  "CLARIFICATION",
  "READY_FOR_DEV",
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "CLIENT_REVIEW",
  "READY_FOR_RELEASE",
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
    canCreateSprintPlanning: true,
    canStartSprint: true,
    canEndSprint: true,
    canDeleteSprint: true,
    canMoveTask: true,
    allowedTransitions: {},
    createStages: ALL_STAGE_IDS,
    modifyStages: ALL_STAGE_IDS,
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
