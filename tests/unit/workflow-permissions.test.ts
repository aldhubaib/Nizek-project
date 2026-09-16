import { describe, it, expect } from "vitest";
import {
  ALL_FIELDS,
  FULL_WORKFLOW_PERMISSIONS,
  MEMBER_WORKFLOW_PERMISSIONS,
  NO_WORKFLOW_PERMISSIONS,
  WORKFLOW_ACTIONS,
  canModifyField,
  canTakeTransition,
  canWorkflow,
  hydrateWorkflowPermissions,
  pickWritableFieldValues,
  stringifyModifyByRole,
  stringifyMoveRoleIds,
  workflowPermissionsFromRole,
  MOVE_PERMISSION_DENIED,
  isMovePermissionError,
  roleIsUsedOnBlueprint,
} from "@/lib/workflow-permissions";

describe("workflowPermissionsFromRole", () => {
  it("grants nothing when no role resolved", () => {
    expect(workflowPermissionsFromRole(null)).toEqual(NO_WORKFLOW_PERMISSIONS);
    expect(workflowPermissionsFromRole(undefined)).toEqual(NO_WORKFLOW_PERMISSIONS);
  });

  it("expands a flow admin to everything", () => {
    const perms = workflowPermissionsFromRole({ isAdmin: true });
    for (const action of WORKFLOW_ACTIONS) {
      expect(canWorkflow(perms, action)).toBe(true);
    }
  });

  it("carries individual flags through", () => {
    const perms = workflowPermissionsFromRole({
      canCreateRecord: true,
      canMoveRecord: true,
    });
    expect(canWorkflow(perms, "createRecord")).toBe(true);
    expect(canWorkflow(perms, "moveRecord")).toBe(true);
    expect(canWorkflow(perms, "deleteRecord")).toBe(false);
    expect(canWorkflow(perms, "manageRoles")).toBe(false);
  });
});

describe("canModifyField", () => {
  it("lets an admin edit any field in any column", () => {
    expect(
      canModifyField(FULL_WORKFLOW_PERMISSIONS, "draft", "article"),
    ).toBe(true);
  });

  it("refuses edits when the role cannot edit records", () => {
    const perms = workflowPermissionsFromRole({ canEditRecord: false });
    expect(canModifyField(perms, "draft", "article")).toBe(false);
  });

  it("allows every field when edit is on and no matrix is set", () => {
    const perms = workflowPermissionsFromRole({ canEditRecord: true });
    expect(canModifyField(perms, "draft", "article")).toBe(true);
    expect(canModifyField(perms, "done", "title")).toBe(true);
  });

  it("restricts to listed fields in a column", () => {
    const perms = workflowPermissionsFromRole({
      canEditRecord: true,
      modifyFields: JSON.stringify({
        draft: ["article", "title"],
        review: ALL_FIELDS,
      }),
    });
    expect(canModifyField(perms, "draft", "article")).toBe(true);
    expect(canModifyField(perms, "draft", "cost")).toBe(false);
    expect(canModifyField(perms, "review", "cost")).toBe(true);
    expect(canModifyField(perms, "done", "article")).toBe(false);
  });

  it("strips fields the role cannot write", () => {
    const perms = workflowPermissionsFromRole({
      canEditRecord: true,
      modifyFields: JSON.stringify({ draft: ["article"] }),
    });
    expect(
      pickWritableFieldValues(perms, "draft", {
        article: "<p>Hi</p>",
        title: "Nope",
      }),
    ).toEqual({ article: "<p>Hi</p>" });
  });
});

describe("canTakeTransition", () => {
  it("allows every move when move is on and no matrix is set", () => {
    const perms = workflowPermissionsFromRole({ canMoveRecord: true });
    expect(canTakeTransition(perms, "a", "b")).toBe(true);
  });

  it("refuses a move the matrix does not list", () => {
    const perms = workflowPermissionsFromRole({
      canMoveRecord: true,
      allowedTransitions: JSON.stringify({ a: ["b"] }),
    });
    expect(canTakeTransition(perms, "a", "b")).toBe(true);
    expect(canTakeTransition(perms, "a", "c")).toBe(false);
    expect(canTakeTransition(perms, "b", "c")).toBe(false);
  });

  it("refuses moves when the role cannot move", () => {
    const perms = workflowPermissionsFromRole({ canMoveRecord: false });
    expect(canTakeTransition(perms, "a", "b")).toBe(false);
  });
});

describe("MEMBER_WORKFLOW_PERMISSIONS", () => {
  it("leaves a project member open until the blueprint restricts them", () => {
    for (const action of WORKFLOW_ACTIONS) {
      expect(canWorkflow(MEMBER_WORKFLOW_PERMISSIONS, action)).toBe(true);
    }
  });
});

describe("hydrateWorkflowPermissions", () => {
  const writer = { id: "writer" };

  it("keeps the role open when the blueprint has no rules", () => {
    const perms = hydrateWorkflowPermissions(writer, {
      statuses: [{ id: "todo" }],
      transitions: [{ fromStatusId: "todo", toStatusId: "doing" }],
    });
    expect(canModifyField(perms, "todo", "article")).toBe(true);
    expect(canTakeTransition(perms, "todo", "doing")).toBe(true);
  });

  it("limits fields on a status that lists roles", () => {
    const perms = hydrateWorkflowPermissions(writer, {
      statuses: [
        {
          id: "todo",
          modifyByRole: stringifyModifyByRole({
            writer: ["article"],
            reviewer: ALL_FIELDS,
          }),
        },
        { id: "doing" },
      ],
      transitions: [],
    });
    expect(canModifyField(perms, "todo", "article")).toBe(true);
    expect(canModifyField(perms, "todo", "cost")).toBe(false);
    expect(canModifyField(perms, "doing", "cost")).toBe(true);
  });

  it("blocks a role that is not listed on that status", () => {
    const perms = hydrateWorkflowPermissions(
      { id: "viewer" },
      {
        statuses: [
          {
            id: "todo",
            modifyByRole: stringifyModifyByRole({ writer: ALL_FIELDS }),
          },
        ],
        transitions: [],
      },
    );
    expect(canModifyField(perms, "todo", "article")).toBe(false);
  });

  it("limits who may take an arrow", () => {
    const writerPerms = hydrateWorkflowPermissions(writer, {
      statuses: [{ id: "todo" }, { id: "doing" }],
      transitions: [
        {
          fromStatusId: "todo",
          toStatusId: "doing",
          moveRoleIds: stringifyMoveRoleIds(["writer"]),
        },
      ],
    });
    const viewerPerms = hydrateWorkflowPermissions(
      { id: "viewer" },
      {
        statuses: [{ id: "todo" }, { id: "doing" }],
        transitions: [
          {
            fromStatusId: "todo",
            toStatusId: "doing",
            moveRoleIds: stringifyMoveRoleIds(["writer"]),
          },
        ],
      },
    );
    expect(canTakeTransition(writerPerms, "todo", "doing")).toBe(true);
    expect(canTakeTransition(viewerPerms, "todo", "doing")).toBe(false);
    expect(
      canTakeTransition(
        hydrateWorkflowPermissions([], {
          statuses: [{ id: "todo" }, { id: "doing" }],
          transitions: [
            {
              fromStatusId: "todo",
              toStatusId: "doing",
              moveRoleIds: stringifyMoveRoleIds(["writer"]),
            },
          ],
        }),
        "todo",
        "doing",
      ),
    ).toBe(false);
  });

  it("unions fields when a person holds more than one role", () => {
    const perms = hydrateWorkflowPermissions(["writer", "reviewer"], {
      statuses: [
        {
          id: "todo",
          modifyByRole: stringifyModifyByRole({
            writer: ["article"],
            reviewer: ["title"],
          }),
        },
      ],
      transitions: [],
    });
    expect(canModifyField(perms, "todo", "article")).toBe(true);
    expect(canModifyField(perms, "todo", "title")).toBe(true);
    expect(canModifyField(perms, "todo", "cost")).toBe(false);
  });
});

describe("isMovePermissionError", () => {
  it("recognizes the board move copy and the older server wording", () => {
    expect(isMovePermissionError(MOVE_PERMISSION_DENIED)).toBe(true);
    expect(
      isMovePermissionError(
        "You do not have permission to make that move on this flow.",
      ),
    ).toBe(true);
    expect(isMovePermissionError("That column no longer exists")).toBe(false);
  });
});

describe("roleIsUsedOnBlueprint", () => {
  it("is in use when listed on a status or an arrow", () => {
    expect(
      roleIsUsedOnBlueprint("writer", {
        statuses: [
          {
            modifyByRole: stringifyModifyByRole({ writer: ["article"] }),
          },
        ],
        transitions: [],
      }),
    ).toBe(true);
    expect(
      roleIsUsedOnBlueprint("writer", {
        statuses: [{ modifyByRole: null }],
        transitions: [
          { moveRoleIds: stringifyMoveRoleIds(["writer"]) },
        ],
      }),
    ).toBe(true);
    expect(
      roleIsUsedOnBlueprint("writer", {
        statuses: [{ modifyByRole: null }],
        transitions: [{ moveRoleIds: null }],
      }),
    ).toBe(false);
  });
});
