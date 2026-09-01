import { describe, it, expect } from "vitest";
import {
  getPermissionsFromRole,
  canTransition,
  canModifyInStage,
  canSprint,
  getAdminPermissions,
} from "@/lib/permissions";

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
        TODO: ["IN_DEVELOPMENT"],
        IN_DEVELOPMENT: ["INTERNAL_REVIEW"],
      }),
    });

    expect(perms.canMoveTask).toBe(true);
    expect(canTransition(perms, "TODO", "IN_DEVELOPMENT")).toBe(true);
    expect(canTransition(perms, "IN_DEVELOPMENT", "INTERNAL_REVIEW")).toBe(true);
  });

  it("still denies transitions that were never granted", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({ TODO: ["IN_DEVELOPMENT"] }),
    });

    // Stage-skipping pair is not in the map.
    expect(canTransition(perms, "TODO", "INTERNAL_REVIEW")).toBe(false);
    // Rollback was not granted.
    expect(canTransition(perms, "IN_DEVELOPMENT", "TODO")).toBe(false);
  });

  it("keeps everything denied for a role with no transitions and no flag", () => {
    const perms = getPermissionsFromRole({ ...baseRole, allowedTransitions: null });
    expect(perms.canMoveTask).toBe(false);
    expect(canTransition(perms, "TODO", "IN_DEVELOPMENT")).toBe(false);
  });

  it("null role (member without a project role) has no permissions", () => {
    const perms = getPermissionsFromRole(null);
    expect(perms.canMoveTask).toBe(false);
    expect(canTransition(perms, "TODO", "IN_DEVELOPMENT")).toBe(false);
  });

  it("reads a stored transition literally, with no stage aliasing", () => {
    // canTransition used to carry three compatibility branches, quietly
    // granting Internal Review → Done to a role that only named Client Review,
    // and Backlog → Todo to one that only named Clarification. Those stages no
    // longer exist and the migration rewrote every stored role, so a role now
    // grants exactly what it says and nothing else.
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({
        INTERNAL_REVIEW: ["DONE", "IN_DEVELOPMENT"],
      }),
    });

    expect(canTransition(perms, "INTERNAL_REVIEW", "DONE")).toBe(true);
    expect(canTransition(perms, "INTERNAL_REVIEW", "IN_DEVELOPMENT")).toBe(true);

    const rollbackOnly = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({
        INTERNAL_REVIEW: ["IN_DEVELOPMENT"],
      }),
    });
    expect(canTransition(rollbackOnly, "INTERNAL_REVIEW", "DONE")).toBe(false);
  });

  it("grants nothing over the sprint-driven stages", () => {
    // Planned, Next, Completed and Shipped follow the sprint. A role that
    // somehow named one still cannot be used to move a task there, because
    // moveTask refuses lifecycle targets outright.
    const perms = getPermissionsFromRole({
      ...baseRole,
      canMoveTask: true,
      allowedStages: JSON.stringify(["BACKLOG", "TODO", "IN_DEVELOPMENT"]),
    });

    expect(Object.keys(perms.allowedTransitions).sort()).toEqual([
      "BACKLOG",
      "DONE",
      "INTERNAL_REVIEW",
      "IN_DEVELOPMENT",
      "TODO",
    ].sort());
    expect(perms.allowedTransitions["PLANNED"]).toBeUndefined();
    expect(perms.allowedTransitions["SHIPPED"]).toBeUndefined();
  });

  it("admin roles bypass transition checks entirely", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      isAdmin: true,
      allowedTransitions: null,
    });
    expect(canTransition(perms, "BACKLOG", "DONE")).toBe(true);
  });
});

describe("modify covers every stage a task can sit in", () => {
  // Moving and editing are different questions. A task follows its sprint into
  // Planned, Next, Completed and Shipped, and while it sits there it is still
  // edited like any other — so modify has to reach stages no one can drag to.
  it("blanket modify reaches the sprint-driven stages, not just the movable ones", () => {
    const perms = getPermissionsFromRole({ ...baseRole, canModifyTask: true });

    for (const stage of ["BACKLOG", "TODO", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "DONE"]) {
      expect(canModifyInStage(perms, stage)).toBe(true);
    }
    for (const stage of ["PLANNED", "NEXT", "COMPLETED", "SHIPPED"]) {
      expect(canModifyInStage(perms, stage)).toBe(true);
    }
  });

  it("a configured role grants exactly the stages it names", () => {
    const perms = getPermissionsFromRole({
      ...baseRole,
      allowedTransitions: JSON.stringify({ _modify: ["BACKLOG", "PLANNED", "TODO"] }),
    });

    expect(perms.canModifyTask).toBe(true);
    expect(canModifyInStage(perms, "PLANNED")).toBe(true);
    expect(canModifyInStage(perms, "SHIPPED")).toBe(false);
    expect(canModifyInStage(perms, "IN_DEVELOPMENT")).toBe(false);
  });

  it("names no stages, holds no rights", () => {
    const perms = getPermissionsFromRole(baseRole);
    expect(perms.canModifyTask).toBe(false);
    expect(canModifyInStage(perms, "BACKLOG")).toBe(false);
    expect(canModifyInStage(perms, "PLANNED")).toBe(false);
  });

  it("admins modify in every stage", () => {
    for (const stage of ["BACKLOG", "PLANNED", "SHIPPED"]) {
      expect(canModifyInStage(getAdminPermissions(), stage)).toBe(true);
    }
  });
});

describe("create is one right, not one per stage", () => {
  it("keeps the right for roles saved back when create was per-stage", () => {
    // Nothing writes _create any more, but a role saved before the collapse
    // still carries it and must not silently lose the right to create.
    const perms = getPermissionsFromRole({
      ...baseRole,
      canCreateTask: false,
      allowedTransitions: JSON.stringify({ _create: ["BACKLOG"] }),
    });
    expect(perms.canCreateTask).toBe(true);
  });

  it("otherwise follows the flag", () => {
    expect(getPermissionsFromRole({ ...baseRole, canCreateTask: true }).canCreateTask).toBe(true);
    expect(getPermissionsFromRole(baseRole).canCreateTask).toBe(false);
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
