import { describe, it, expect } from "vitest";
import { getPermissionsFromRole, canTransition, canSprint, getAdminPermissions } from "@/lib/permissions";

const baseRole = {
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
  allowedStages: null,
};

describe("getPermissionsFromRole — move permission", () => {
  it("derives canMoveTask from configured transitions even when the flag is false", () => {
    // Regression: roles saved with Forward checkboxes ticked but the hidden
    // canMoveTask flag false denied every move ("Your role cannot move…").
    const perms = getPermissionsFromRole({
      ...baseRole,
      canMoveTask: false,
      allowedTransitions: JSON.stringify({
        CLARIFICATION: ["IN_DEVELOPMENT"],
        IN_DEVELOPMENT: ["INTERNAL_REVIEW"],
      }),
    });

    expect(perms.canMoveTask).toBe(true);
    expect(canTransition(perms, "CLARIFICATION", "IN_DEVELOPMENT")).toBe(true);
    expect(canTransition(perms, "IN_DEVELOPMENT", "INTERNAL_REVIEW")).toBe(true);
  });

  it("still denies transitions that were never granted", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({ CLARIFICATION: ["IN_DEVELOPMENT"] }),
    });

    // Stage-skipping pair is not in the map.
    expect(canTransition(perms, "CLARIFICATION", "INTERNAL_REVIEW")).toBe(false);
    // Rollback was not granted.
    expect(canTransition(perms, "IN_DEVELOPMENT", "CLARIFICATION")).toBe(false);
  });

  it("keeps everything denied for a role with no transitions and no flag", () => {
    const perms = getPermissionsFromRole({ ...baseRole, allowedTransitions: null });
    expect(perms.canMoveTask).toBe(false);
    expect(canTransition(perms, "CLARIFICATION", "IN_DEVELOPMENT")).toBe(false);
  });

  it("null role (member without a project role) has no permissions", () => {
    const perms = getPermissionsFromRole(null);
    expect(perms.canMoveTask).toBe(false);
    expect(canTransition(perms, "CLARIFICATION", "IN_DEVELOPMENT")).toBe(false);
  });

  it("forward out of Internal Review covers the bug lane to Done", () => {
    // Regression: bugs skip Client Review, so the board redirects a drop on
    // Client Review to Done. Roles saved before the editor started writing
    // that shortcut only stored INTERNAL_REVIEW → CLIENT_REVIEW and denied
    // the move ("Permission Denied") even though Forward was ticked.
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({
        INTERNAL_REVIEW: ["CLIENT_REVIEW", "IN_DEVELOPMENT"],
      }),
    });

    expect(canTransition(perms, "INTERNAL_REVIEW", "DONE")).toBe(true);
    // The shortcut only follows a granted forward, not a rollback-only role.
    const rollbackOnly = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({
        INTERNAL_REVIEW: ["IN_DEVELOPMENT"],
      }),
    });
    expect(canTransition(rollbackOnly, "INTERNAL_REVIEW", "DONE")).toBe(false);
  });

  it("forwards Client Review to Done when the role still names Ready for Release", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({
        CLIENT_REVIEW: ["READY_FOR_RELEASE", "INTERNAL_REVIEW"],
      }),
    });

    expect(canTransition(perms, "CLIENT_REVIEW", "DONE")).toBe(true);
    expect(canTransition(perms, "CLIENT_REVIEW", "INTERNAL_REVIEW")).toBe(true);
  });

  it("forwards Backlog to Ready for Dev when the role still names Clarification", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({
        NEW_REQUEST: ["CLARIFICATION"],
        READY_FOR_DEV: ["CLARIFICATION", "IN_DEVELOPMENT"],
      }),
    });

    expect(canTransition(perms, "NEW_REQUEST", "READY_FOR_DEV")).toBe(true);
    expect(canTransition(perms, "READY_FOR_DEV", "NEW_REQUEST")).toBe(true);
  });

  it("admin roles bypass transition checks entirely", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      isAdmin: true,
      allowedTransitions: null,
    });
    expect(canTransition(perms, "CLARIFICATION", "DONE")).toBe(true);
  });
});

describe("canSprint", () => {
  it("denies every sprint action on a role with no sprint flags", () => {
    const perms = getPermissionsFromRole(baseRole);
    expect(canSprint(perms, "createPlanning")).toBe(false);
    expect(canSprint(perms, "start")).toBe(false);
    expect(canSprint(perms, "end")).toBe(false);
    expect(canSprint(perms, "delete")).toBe(false);
  });

  it("grants only the sprint actions that are ticked", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      canCreateSprintPlanning: true,
      canEndSprint: true,
    });
    expect(canSprint(perms, "createPlanning")).toBe(true);
    expect(canSprint(perms, "start")).toBe(false);
    expect(canSprint(perms, "end")).toBe(true);
    expect(canSprint(perms, "delete")).toBe(false);
  });

  it("lets admin and system-admin roles do every sprint action", () => {
    expect(canSprint(getPermissionsFromRole({ ...baseRole, isAdmin: true }), "end")).toBe(true);
    expect(canSprint(getAdminPermissions(), "createPlanning")).toBe(true);
    expect(canSprint(getAdminPermissions(), "delete")).toBe(true);
  });
});
