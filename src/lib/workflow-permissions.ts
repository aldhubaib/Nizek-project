/**
 * What somebody may do on a project board (or a global module).
 *
 * Roles are named once for the project. What they may edit and which
 * arrows they may take lives on the blueprint — per status, per move —
 * the same split as Jira. Sprint ProjectRole is never read here.
 */

export const ALL_FIELDS = "*" as const;

export type ModifyFieldList = string[] | typeof ALL_FIELDS;
export type ModifyFieldsMap = Record<string, ModifyFieldList>;
export type TransitionMap = Record<string, string[]>;

export interface WorkflowPermissions {
  isAdmin: boolean;
  canCreateRecord: boolean;
  canEditRecord: boolean;
  canDeleteRecord: boolean;
  canMoveRecord: boolean;
  canManageRoles: boolean;
  canEditBlueprint: boolean;
  /**
   * Null means every blueprint arrow, when canMoveRecord is on.
   * A missing from-key means that column cannot be left.
   */
  allowedTransitions: TransitionMap | null;
  /**
   * Null means every field in every column, when canEditRecord is on.
   * A missing status key means nothing is editable there.
   */
  modifyFields: ModifyFieldsMap | null;
}

export const WORKFLOW_ACTIONS = [
  "createRecord",
  "editRecord",
  "deleteRecord",
  "moveRecord",
  "manageRoles",
  "editBlueprint",
] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

const ACTION_FIELD: Record<WorkflowAction, keyof WorkflowPermissions> = {
  createRecord: "canCreateRecord",
  editRecord: "canEditRecord",
  deleteRecord: "canDeleteRecord",
  moveRecord: "canMoveRecord",
  manageRoles: "canManageRoles",
  editBlueprint: "canEditBlueprint",
};

export const WORKFLOW_ACTION_LABEL: Record<WorkflowAction, string> = {
  createRecord: "create records on this flow",
  editRecord: "edit records on this flow",
  deleteRecord: "delete records on this flow",
  moveRecord: "move records on this flow",
  manageRoles: "manage board roles",
  editBlueprint: "edit this flow's blueprint",
};

export const NO_WORKFLOW_PERMISSIONS: WorkflowPermissions = {
  isAdmin: false,
  canCreateRecord: false,
  canEditRecord: false,
  canDeleteRecord: false,
  canMoveRecord: false,
  canManageRoles: false,
  canEditBlueprint: false,
  allowedTransitions: null,
  modifyFields: null,
};

export const FULL_WORKFLOW_PERMISSIONS: WorkflowPermissions = {
  isAdmin: true,
  canCreateRecord: true,
  canEditRecord: true,
  canDeleteRecord: true,
  canMoveRecord: true,
  canManageRoles: true,
  canEditBlueprint: true,
  allowedTransitions: null,
  modifyFields: null,
};

/** Project members. Blueprint rules then narrow edit and move. */
export const MEMBER_WORKFLOW_PERMISSIONS: WorkflowPermissions = {
  isAdmin: false,
  canCreateRecord: true,
  canEditRecord: true,
  canDeleteRecord: true,
  canMoveRecord: true,
  canManageRoles: true,
  canEditBlueprint: true,
  allowedTransitions: null,
  modifyFields: null,
};

export type WorkflowRoleFlags = {
  isAdmin: boolean;
  canCreateRecord: boolean;
  canEditRecord: boolean;
  canDeleteRecord: boolean;
  canMoveRecord: boolean;
  canManageRoles: boolean;
  canEditBlueprint: boolean;
  allowedTransitions?: string | null;
  modifyFields?: string | null;
};

export function parseTransitionMap(raw: string | null | undefined): TransitionMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const next: TransitionMap = {};
    for (const [from, to] of Object.entries(parsed)) {
      if (!Array.isArray(to)) continue;
      next[from] = to.filter((id): id is string => typeof id === "string");
    }
    return next;
  } catch {
    return null;
  }
}

export function parseModifyFieldsMap(
  raw: string | null | undefined,
): ModifyFieldsMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const next: ModifyFieldsMap = {};
    for (const [statusId, fields] of Object.entries(parsed)) {
      if (fields === ALL_FIELDS) {
        next[statusId] = ALL_FIELDS;
        continue;
      }
      if (!Array.isArray(fields)) continue;
      next[statusId] = fields.filter((id): id is string => typeof id === "string");
    }
    return next;
  } catch {
    return null;
  }
}

export function stringifyTransitionMap(map: TransitionMap | null): string | null {
  if (map === null) return null;
  return JSON.stringify(map);
}

export function stringifyModifyFieldsMap(map: ModifyFieldsMap | null): string | null {
  if (map === null) return null;
  return JSON.stringify(map);
}

/** `{ [moduleRoleId]: fieldId[] | "*" }` on a status. Null = not set. */
export type ModifyByRoleMap = Record<string, ModifyFieldList>;

export function parseModifyByRole(
  raw: string | null | undefined,
): ModifyByRoleMap | null {
  return parseModifyFieldsMap(raw);
}

export function stringifyModifyByRole(map: ModifyByRoleMap | null): string | null {
  return stringifyModifyFieldsMap(map);
}

export function parseMoveRoleIds(raw: string | null | undefined): string[] | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

export function stringifyMoveRoleIds(ids: string[] | null): string | null {
  if (ids === null) return null;
  return JSON.stringify(ids);
}

export function roleIdsUsedOnBlueprint(blueprint: {
  statuses: { modifyByRole?: string | null }[];
  transitions: { moveRoleIds?: string | null }[];
}): Set<string> {
  const used = new Set<string>();
  for (const status of blueprint.statuses) {
    const map = parseModifyByRole(status.modifyByRole);
    if (!map) continue;
    for (const id of Object.keys(map)) used.add(id);
  }
  for (const arrow of blueprint.transitions) {
    const ids = parseMoveRoleIds(arrow.moveRoleIds);
    if (!ids) continue;
    for (const id of ids) used.add(id);
  }
  return used;
}

export function roleIsUsedOnBlueprint(
  roleId: string,
  blueprint: {
    statuses: { modifyByRole?: string | null }[];
    transitions: { moveRoleIds?: string | null }[];
  },
): boolean {
  return roleIdsUsedOnBlueprint(blueprint).has(roleId);
}

export const ROLE_IN_USE_ON_BLUEPRINT =
  "This role is used on the blueprint. Uncheck it there before deleting it.";

export type BlueprintPermissionSource = {
  statuses: { id: string; modifyByRole?: string | null }[];
  transitions: {
    fromStatusId: string | null;
    toStatusId: string;
    moveRoleIds?: string | null;
  }[];
};

/**
 * Apply the blueprint's per-status / per-arrow rules onto the named roles
 * this person holds. Unset rules stay open. Set rules restrict. Holding
 * several roles unions what they may edit and which arrows they may take.
 */
export function hydrateWorkflowPermissions(
  roleIds: string[] | { id?: string } | null | undefined,
  blueprint: BlueprintPermissionSource,
): WorkflowPermissions {
  const ids = new Set(
    Array.isArray(roleIds)
      ? roleIds
      : roleIds?.id
        ? [roleIds.id]
        : [],
  );
  const base = { ...MEMBER_WORKFLOW_PERMISSIONS };

  const anyStatusRule = blueprint.statuses.some(
    (status) => parseModifyByRole(status.modifyByRole) !== null,
  );
  if (anyStatusRule) {
    const modify: ModifyFieldsMap = {};
    for (const status of blueprint.statuses) {
      const map = parseModifyByRole(status.modifyByRole);
      if (!map) {
        modify[status.id] = ALL_FIELDS;
        continue;
      }
      const lists = [...ids]
        .map((id) => map[id])
        .filter((list): list is ModifyFieldList => list !== undefined);
      const merged = unionFieldLists(lists);
      if (merged) modify[status.id] = merged;
    }
    base.modifyFields = modify;
    base.canEditRecord = Object.keys(modify).length > 0;
  }

  const anyArrowRule = blueprint.transitions.some(
    (arrow) => parseMoveRoleIds(arrow.moveRoleIds) !== null,
  );
  if (anyArrowRule) {
    const allowed: TransitionMap = {};
    const grant = (fromId: string, toId: string) => {
      const current = allowed[fromId] ?? [];
      if (!current.includes(toId)) allowed[fromId] = [...current, toId];
    };
    for (const arrow of blueprint.transitions) {
      const listed = parseMoveRoleIds(arrow.moveRoleIds);
      const permitted =
        listed === null ? true : listed.some((id) => ids.has(id));
      if (!permitted) continue;
      if (arrow.fromStatusId) {
        grant(arrow.fromStatusId, arrow.toStatusId);
        continue;
      }
      for (const status of blueprint.statuses) {
        if (status.id === arrow.toStatusId) continue;
        grant(status.id, arrow.toStatusId);
      }
    }
    base.allowedTransitions = allowed;
    base.canMoveRecord = Object.values(allowed).some((list) => list.length > 0);
  }

  return base;
}

function unionFieldLists(lists: ModifyFieldList[]): ModifyFieldList | undefined {
  if (lists.length === 0) return undefined;
  if (lists.some((list) => list === ALL_FIELDS)) return ALL_FIELDS;
  return [...new Set(lists.flat())];
}

export function workflowPermissionsFromRole(
  role: Partial<WorkflowRoleFlags> | null | undefined,
): WorkflowPermissions {
  if (!role) return { ...NO_WORKFLOW_PERMISSIONS };
  if (role.isAdmin) return { ...FULL_WORKFLOW_PERMISSIONS };
  return {
    isAdmin: false,
    canCreateRecord: role.canCreateRecord === true,
    canEditRecord: role.canEditRecord === true,
    canDeleteRecord: role.canDeleteRecord === true,
    canMoveRecord: role.canMoveRecord === true,
    canManageRoles: role.canManageRoles === true,
    canEditBlueprint: role.canEditBlueprint === true,
    allowedTransitions: parseTransitionMap(role.allowedTransitions),
    modifyFields: parseModifyFieldsMap(role.modifyFields),
  };
}

export function canWorkflow(
  permissions: WorkflowPermissions,
  action: WorkflowAction,
): boolean {
  if (permissions.isAdmin) return true;
  return permissions[ACTION_FIELD[action]] === true;
}

export function canModifyField(
  permissions: WorkflowPermissions,
  statusId: string | null,
  fieldId: string,
): boolean {
  if (permissions.isAdmin) return true;
  if (!permissions.canEditRecord) return false;
  if (!permissions.modifyFields) return true;
  if (!statusId) return false;
  const allowed = permissions.modifyFields[statusId];
  if (!allowed) return false;
  if (allowed === ALL_FIELDS) return true;
  return allowed.includes(fieldId);
}

export function canTakeTransition(
  permissions: WorkflowPermissions,
  fromStatusId: string | null,
  toStatusId: string | null,
): boolean {
  if (permissions.isAdmin) return true;
  if (!permissions.canMoveRecord) return false;
  if (!permissions.allowedTransitions) return true;
  if (!fromStatusId || !toStatusId) return false;
  return (permissions.allowedTransitions[fromStatusId] ?? []).includes(toStatusId);
}

export const MOVE_PERMISSION_DENIED =
  "You don't have permission to move this card. Please ask your admin if you think there is a mistake.";

export function isMovePermissionError(message: string | null | undefined): boolean {
  if (!message) return false;
  if (message === MOVE_PERMISSION_DENIED) return true;
  return /permission to (make that )?move/i.test(message);
}

export function pickWritableFieldValues(
  permissions: WorkflowPermissions,
  statusId: string | null,
  values: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [fieldId, value] of Object.entries(values)) {
    if (canModifyField(permissions, statusId, fieldId)) next[fieldId] = value;
  }
  return next;
}

/** Native columns use their binding key as well as the layout field id. */
export function canModifyNative(
  permissions: WorkflowPermissions,
  statusId: string | null,
  binding: string,
  layoutFieldId?: string | null,
): boolean {
  if (canModifyField(permissions, statusId, binding)) return true;
  if (layoutFieldId && canModifyField(permissions, statusId, layoutFieldId)) {
    return true;
  }
  return false;
}
