import { describe, it, expect } from "vitest";
import { getPermissionsFromRole, canTransition } from "@/lib/permissions";

const baseRole = {
  isAdmin: false,
  canCreateTask: false,
  canModifyTask: false,
  canDeleteTask: false,
  canDeclineTask: false,
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
        CLARIFICATION: ["READY_FOR_DEV"],
        READY_FOR_DEV: ["IN_DEVELOPMENT"],
      }),
    });

    expect(perms.canMoveTask).toBe(true);
    expect(canTransition(perms, "CLARIFICATION", "READY_FOR_DEV")).toBe(true);
    expect(canTransition(perms, "READY_FOR_DEV", "IN_DEVELOPMENT")).toBe(true);
  });

  it("still denies transitions that were never granted", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({ CLARIFICATION: ["READY_FOR_DEV"] }),
    });

    // Stage-skipping pair is not in the map.
    expect(canTransition(perms, "CLARIFICATION", "IN_DEVELOPMENT")).toBe(false);
    // Rollback was not granted.
    expect(canTransition(perms, "READY_FOR_DEV", "CLARIFICATION")).toBe(false);
  });

  it("keeps everything denied for a role with no transitions and no flag", () => {
    const perms = getPermissionsFromRole({ ...baseRole, allowedTransitions: null });
    expect(perms.canMoveTask).toBe(false);
    expect(canTransition(perms, "CLARIFICATION", "READY_FOR_DEV")).toBe(false);
  });

  it("null role (member without a project role) has no permissions", () => {
    const perms = getPermissionsFromRole(null);
    expect(perms.canMoveTask).toBe(false);
    expect(canTransition(perms, "CLARIFICATION", "READY_FOR_DEV")).toBe(false);
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
