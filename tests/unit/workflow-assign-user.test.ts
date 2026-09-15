import { describe, expect, it } from "vitest";
import {
  ASSIGN_MOVER,
  assignedUserIdFromActions,
  cleanActionConfig,
} from "../../src/lib/workflow/actions";
import { sendInviteActionsForMove } from "../../src/lib/workflow/engine";

describe("assign user action", () => {
  it("keeps a chosen person or the mover token", () => {
    expect(cleanActionConfig("assign_user", { userId: "u1" })).toEqual({
      userId: "u1",
    });
    expect(cleanActionConfig("assign_user", { userId: ASSIGN_MOVER })).toEqual({
      userId: ASSIGN_MOVER,
    });
    expect(cleanActionConfig("assign_user", {})).toEqual({ userId: "" });
  });

  it("resolves the last assign action, including unassign and mover", () => {
    expect(assignedUserIdFromActions([], "actor")).toBeUndefined();
    expect(
      assignedUserIdFromActions(
        [{ type: "assign_user", config: { userId: "u2" } }],
        "actor",
      ),
    ).toBe("u2");
    expect(
      assignedUserIdFromActions(
        [{ type: "assign_user", config: { userId: ASSIGN_MOVER } }],
        "actor",
      ),
    ).toBe("actor");
    expect(
      assignedUserIdFromActions(
        [{ type: "assign_user", config: { userId: "" } }],
        "actor",
      ),
    ).toBe("");
  });
});

describe("send invite on move", () => {
  it("picks up send invite on the column you leave", () => {
    const invite = {
      id: "a1",
      hook: "after" as const,
      type: "send_invite" as const,
      config: { field: "fld" },
      position: 0,
    };
    expect(
      sendInviteActionsForMove({
        fromActions: [invite],
        toActions: [],
        transition: null,
      }),
    ).toEqual([invite]);
  });
});
