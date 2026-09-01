/**
 * What somebody may do on a board.
 *
 * Deliberately not `src/lib/permissions.ts`. That one is built around the
 * sprint pipeline: its `allowedTransitions` is a map keyed by `Stage` names,
 * describing which stage may follow which. Board columns are rows with
 * generated ids and no inherent order, so that map has nothing to say about
 * them — and movement here is free anyway, the way it is on any board of this
 * kind, so moving is one flag rather than a graph.
 *
 * Kept free of Prisma and React so it can be unit-tested directly, the same way
 * `src/lib/audit-flags.ts` is.
 */

export interface BoardPermissions {
  /** Everything on this board, its settings included. */
  isAdmin: boolean;
  canManageColumns: boolean;
  canManageTypes: boolean;
  canManageMembers: boolean;
  canCreateCard: boolean;
  canEditCard: boolean;
  canDeleteCard: boolean;
  canMoveCard: boolean;
  canComment: boolean;
}

export const BOARD_ACTIONS = [
  "manageColumns",
  "manageTypes",
  "manageMembers",
  "createCard",
  "editCard",
  "deleteCard",
  "moveCard",
  "comment",
] as const;

export type BoardAction = (typeof BOARD_ACTIONS)[number];

const ACTION_FIELD: Record<BoardAction, keyof BoardPermissions> = {
  manageColumns: "canManageColumns",
  manageTypes: "canManageTypes",
  manageMembers: "canManageMembers",
  createCard: "canCreateCard",
  editCard: "canEditCard",
  deleteCard: "canDeleteCard",
  moveCard: "canMoveCard",
  comment: "canComment",
};

/** Wording the server actions throw and the UI shows, so both agree. */
export const ACTION_LABEL: Record<BoardAction, string> = {
  manageColumns: "change this board's columns",
  manageTypes: "change this board's card types",
  manageMembers: "manage this board's members",
  createCard: "create cards on this board",
  editCard: "edit cards on this board",
  deleteCard: "delete cards on this board",
  moveCard: "move cards on this board",
  comment: "comment on this board",
};

export const NO_BOARD_PERMISSIONS: BoardPermissions = {
  isAdmin: false,
  canManageColumns: false,
  canManageTypes: false,
  canManageMembers: false,
  canCreateCard: false,
  canEditCard: false,
  canDeleteCard: false,
  canMoveCard: false,
  canComment: false,
};

/**
 * The break-glass grant.
 *
 * Without it a board admin could revoke everyone else and lock the board for
 * good, with no way back in short of editing the database. `requireProjectMember`
 * already hands a system admin a virtual project membership for the same
 * reason, so this mirrors a rule the app already applies rather than inventing
 * one.
 */
export const SYSTEM_ADMIN_BOARD_PERMISSIONS: BoardPermissions = {
  isAdmin: true,
  canManageColumns: true,
  canManageTypes: true,
  canManageMembers: true,
  canCreateCard: true,
  canEditCard: true,
  canDeleteCard: true,
  canMoveCard: true,
  canComment: true,
};

/** The stored columns of a `BoardRole`, minus the bookkeeping ones. */
export type BoardRoleFlags = BoardPermissions;

/**
 * Null means no role resolved at all — neither an assigned one nor the board's
 * default — which reads as no access rather than as full access.
 */
export function boardPermissionsFromRole(
  role: Partial<BoardRoleFlags> | null | undefined,
): BoardPermissions {
  if (!role) return NO_BOARD_PERMISSIONS;
  if (role.isAdmin) return { ...SYSTEM_ADMIN_BOARD_PERMISSIONS };
  return {
    isAdmin: false,
    canManageColumns: role.canManageColumns ?? false,
    canManageTypes: role.canManageTypes ?? false,
    canManageMembers: role.canManageMembers ?? false,
    canCreateCard: role.canCreateCard ?? false,
    canEditCard: role.canEditCard ?? false,
    canDeleteCard: role.canDeleteCard ?? false,
    canMoveCard: role.canMoveCard ?? false,
    canComment: role.canComment ?? false,
  };
}

export function canBoard(
  permissions: BoardPermissions,
  action: BoardAction,
): boolean {
  if (permissions.isAdmin) return true;
  return permissions[ACTION_FIELD[action]] === true;
}

/**
 * The roles a board starts with.
 *
 * Viewer is the fallback for anyone on the project who was never given a role,
 * and grants nothing but sight. That is the point: without a default, turning a
 * board on would show an empty tab to the whole team until each person was
 * added by hand, and with a generous one it would hand the project's whole
 * roster write access to a board they were never invited to.
 */
export const SEEDED_BOARD_ROLES: {
  name: string;
  isDefault: boolean;
  flags: BoardPermissions;
}[] = [
  {
    name: "Admin",
    isDefault: false,
    flags: { ...SYSTEM_ADMIN_BOARD_PERMISSIONS },
  },
  {
    name: "Editor",
    isDefault: false,
    flags: {
      ...NO_BOARD_PERMISSIONS,
      canCreateCard: true,
      canEditCard: true,
      canDeleteCard: true,
      canMoveCard: true,
      canComment: true,
    },
  },
  {
    name: "Viewer",
    isDefault: true,
    flags: { ...NO_BOARD_PERMISSIONS },
  },
];
