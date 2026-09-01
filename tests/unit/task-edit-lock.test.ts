import { describe, it, expect } from "vitest";
import { taskEditBlockedReason } from "@/lib/task-edit-lock";
import { getAdminPermissions, getPermissionsFromRole } from "@/lib/permissions";

const DAY = 24 * 60 * 60 * 1000;

function contract(overrides: Partial<{ startDate: Date; endDate: Date; latePayment: boolean }> = {}) {
  return {
    id: "c1",
    contractType: "RETAINER" as never,
    label: null,
    startDate: new Date(Date.now() - 30 * DAY),
    endDate: new Date(Date.now() + 30 * DAY),
    latePayment: false,
    ...overrides,
  };
}

const modifierRole = getPermissionsFromRole({
  isAdmin: false,
  canCreateTask: true,
  canModifyTask: true,
  canMoveTask: false,
  allowedTransitions: JSON.stringify({ _modify: ["BACKLOG", "TODO"] }),
});

describe("taskEditBlockedReason", () => {
  it("lets a permitted role edit a task under a live contract", () => {
    expect(
      taskEditBlockedReason({
        contracts: [contract()],
        isSystemAdmin: false,
        permissions: modifierRole,
        stage: "BACKLOG",
      }),
    ).toBeNull();
  });

  it("blocks a stage the role was not granted, naming it", () => {
    const reason = taskEditBlockedReason({
      contracts: [contract()],
      isSystemAdmin: false,
      permissions: modifierRole,
      stage: "IN_DEVELOPMENT",
    });
    expect(reason).toContain("cannot edit tasks in");
  });

  it("blocks an expired contract even for an admin, matching updateTask", () => {
    // The contract gate in updateTask has no admin bypass, so the screen must
    // not offer an admin edits that would be refused.
    const reason = taskEditBlockedReason({
      contracts: [contract({ endDate: new Date(Date.now() - DAY) })],
      isSystemAdmin: true,
      permissions: getAdminPermissions(),
      stage: "BACKLOG",
    });
    expect(reason).toContain("No active contract");
  });

  it("treats a late payment as no contract", () => {
    expect(
      taskEditBlockedReason({
        contracts: [contract({ latePayment: true })],
        isSystemAdmin: true,
        permissions: getAdminPermissions(),
        stage: "BACKLOG",
      }),
    ).toContain("No active contract");
  });

  it("blocks a project with no contract at all", () => {
    expect(
      taskEditBlockedReason({
        contracts: [],
        isSystemAdmin: true,
        permissions: getAdminPermissions(),
        stage: "BACKLOG",
      }),
    ).toContain("No active contract");
  });

  it("lets an admin edit any stage under a live contract", () => {
    expect(
      taskEditBlockedReason({
        contracts: [contract()],
        isSystemAdmin: true,
        permissions: getAdminPermissions(),
        stage: "SHIPPED",
      }),
    ).toBeNull();
  });
});
