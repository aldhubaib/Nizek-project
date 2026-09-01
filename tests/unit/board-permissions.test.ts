import { describe, it, expect } from "vitest";
import {
  BOARD_ACTIONS,
  NO_BOARD_PERMISSIONS,
  SEEDED_BOARD_ROLES,
  SYSTEM_ADMIN_BOARD_PERMISSIONS,
  boardPermissionsFromRole,
  canBoard,
} from "@/lib/board-permissions";

describe("boardPermissionsFromRole", () => {
  it("grants nothing when no role resolved", () => {
    // Neither an assigned role nor a board default. Reads as no access, which
    // is the safe end to fail towards.
    expect(boardPermissionsFromRole(null)).toEqual(NO_BOARD_PERMISSIONS);
    expect(boardPermissionsFromRole(undefined)).toEqual(NO_BOARD_PERMISSIONS);
  });

  it("expands a board admin to everything", () => {
    const perms = boardPermissionsFromRole({ isAdmin: true });
    for (const action of BOARD_ACTIONS) {
      expect(canBoard(perms, action)).toBe(true);
    }
  });

  it("carries individual flags through", () => {
    const perms = boardPermissionsFromRole({
      canCreateCard: true,
      canMoveCard: true,
    });
    expect(canBoard(perms, "createCard")).toBe(true);
    expect(canBoard(perms, "moveCard")).toBe(true);
    expect(canBoard(perms, "deleteCard")).toBe(false);
    expect(canBoard(perms, "manageColumns")).toBe(false);
  });

  it("treats a missing flag as denied rather than inherited", () => {
    const perms = boardPermissionsFromRole({});
    for (const action of BOARD_ACTIONS) {
      expect(canBoard(perms, action)).toBe(false);
    }
  });

  it("does not let a non-admin role claim isAdmin through a stray flag", () => {
    const perms = boardPermissionsFromRole({ isAdmin: false, canEditCard: true });
    expect(perms.isAdmin).toBe(false);
    expect(canBoard(perms, "manageMembers")).toBe(false);
  });
});

describe("canBoard", () => {
  it("lets a system admin past every check", () => {
    for (const action of BOARD_ACTIONS) {
      expect(canBoard(SYSTEM_ADMIN_BOARD_PERMISSIONS, action)).toBe(true);
    }
  });

  it("refuses every action on empty permissions", () => {
    for (const action of BOARD_ACTIONS) {
      expect(canBoard(NO_BOARD_PERMISSIONS, action)).toBe(false);
    }
  });
});

describe("SEEDED_BOARD_ROLES", () => {
  it("marks exactly one role as the default", () => {
    // The partial unique index in the migration enforces this in the database;
    // the seed had better not be the thing that violates it.
    expect(SEEDED_BOARD_ROLES.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it("seeds the default as read-only", () => {
    const fallback = SEEDED_BOARD_ROLES.find((r) => r.isDefault);
    const perms = boardPermissionsFromRole(fallback?.flags);
    for (const action of BOARD_ACTIONS) {
      expect(canBoard(perms, action)).toBe(false);
    }
  });

  it("ships an admin role so a new board is configurable", () => {
    const admin = SEEDED_BOARD_ROLES.find((r) => r.flags.isAdmin);
    expect(admin).toBeDefined();
  });

  it("gives the editor role card rights but not board settings", () => {
    const editor = SEEDED_BOARD_ROLES.find((r) => r.name === "Editor");
    const perms = boardPermissionsFromRole(editor?.flags);
    expect(canBoard(perms, "createCard")).toBe(true);
    expect(canBoard(perms, "moveCard")).toBe(true);
    expect(canBoard(perms, "manageColumns")).toBe(false);
    expect(canBoard(perms, "manageMembers")).toBe(false);
  });

  it("uses distinct names, which the boardId+name unique index requires", () => {
    const names = SEEDED_BOARD_ROLES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
