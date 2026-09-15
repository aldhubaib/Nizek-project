import { describe, expect, it } from "vitest";
import {
  actionsForMove,
  allowedDestinations,
  applySetFieldActions,
  columnDropHint,
  findTransition,
  isMoveAllowed,
  missingRequiredOnSnapshot,
  moveNeedsDialog,
  requiredFieldIds,
  snapshotFieldIsFilled,
  unfilledFieldIds,
  validateDuring,
} from "../../src/lib/workflow/engine";
import type { FieldSnapshot, WorkflowActionDef, WorkflowTransitionDef } from "../../src/lib/workflow/types";

const filled: FieldSnapshot = {
  native: {
    title: "Website",
    value: "1000",
    contactIds: ["c1"],
    companyIds: ["co1"],
  },
  custom: { fld_priority: "High" },
};

function action(
  partial: Partial<WorkflowActionDef> & Pick<WorkflowActionDef, "type" | "hook">,
): WorkflowActionDef {
  return {
    id: partial.id ?? partial.type,
    position: 1,
    config: {},
    ...partial,
  };
}

describe("isMoveAllowed", () => {
  it("allows anything before a blueprint has any arrows", () => {
    expect(
      isMoveAllowed({
        fromStatusId: "a",
        toStatusId: "b",
        transitionCount: 0,
        allowedToIds: [],
      }),
    ).toBe(true);
    expect(
      isMoveAllowed({
        fromStatusId: "a",
        toStatusId: null,
        transitionCount: 0,
        allowedToIds: [],
      }),
    ).toBe(true);
  });

  it("refuses Unassigned once the blueprint is drawn", () => {
    expect(
      isMoveAllowed({
        fromStatusId: "a",
        toStatusId: null,
        transitionCount: 1,
        allowedToIds: ["b"],
      }),
    ).toBe(false);
  });

  it("lets an unplaced record enter any column", () => {
    expect(
      isMoveAllowed({
        fromStatusId: null,
        toStatusId: "b",
        transitionCount: 2,
        allowedToIds: [],
      }),
    ).toBe(true);
  });

  it("only allows listed destinations", () => {
    expect(
      isMoveAllowed({
        fromStatusId: "a",
        toStatusId: "b",
        transitionCount: 2,
        allowedToIds: ["b"],
      }),
    ).toBe(true);
    expect(
      isMoveAllowed({
        fromStatusId: "a",
        toStatusId: "c",
        transitionCount: 2,
        allowedToIds: ["b"],
      }),
    ).toBe(false);
  });
});

describe("allowedDestinations", () => {
  it("includes common transitions from any status", () => {
    expect(
      allowedDestinations("a", [
        { fromStatusId: "a", toStatusId: "b" },
        { fromStatusId: null, toStatusId: "lost" },
      ]),
    ).toEqual(["b", "lost"]);
  });
});

describe("columnDropHint", () => {
  const arrows = [
    { fromStatusId: "todo", toStatusId: "review" },
    { fromStatusId: "review", toStatusId: "confirmed" },
  ];

  it("stays quiet when the blueprint has no arrows", () => {
    expect(
      columnDropHint("review", { fromStatusId: "todo", transitions: [] }),
    ).toBeNull();
  });

  it("marks reachable columns and dims the rest", () => {
    expect(
      columnDropHint("review", { fromStatusId: "todo", transitions: arrows }),
    ).toBe("allowed");
    expect(
      columnDropHint("confirmed", { fromStatusId: "todo", transitions: arrows }),
    ).toBe("blocked");
    expect(
      columnDropHint("todo", { fromStatusId: "todo", transitions: arrows }),
    ).toBe("home");
  });
});

describe("findTransition", () => {
  const transitions: WorkflowTransitionDef[] = [
    {
      id: "t1",
      workflowId: "w",
      name: "Qualify",
      fromStatusId: "a",
      toStatusId: "b",
      canvasX: null,
      canvasY: null,
      actions: [],
    },
    {
      id: "t2",
      workflowId: "w",
      name: "Lose",
      fromStatusId: null,
      toStatusId: "lost",
      canvasX: null,
      canvasY: null,
      actions: [],
    },
  ];

  it("prefers a specific edge over a common one", () => {
    expect(findTransition("a", "b", transitions)?.id).toBe("t1");
    expect(findTransition("a", "lost", transitions)?.id).toBe("t2");
  });
});

describe("missingRequiredOnSnapshot", () => {
  it("names native and custom blanks", () => {
    expect(
      missingRequiredOnSnapshot(
        {
          native: { title: "A", value: null, contactIds: [], companyIds: ["x"] },
          custom: {},
        },
        ["value", "contacts", "fld_priority"],
        [{ id: "fld_priority", label: "Priority", type: "text" }],
      ),
    ).toEqual(["Value", "At least one contact", "Priority"]);
  });

  it("skips a required field hidden by a pick list", () => {
    expect(
      missingRequiredOnSnapshot(
        {
          native: { title: "A", value: null, contactIds: [], companyIds: [] },
          custom: { type: "Personal" },
        },
        ["fld_company"],
        [
          { id: "type", label: "Type", type: "select" },
          {
            id: "fld_company",
            label: "Company",
            type: "relation",
            visibility: { dependsOn: "type", values: ["Company"] },
          },
        ],
      ),
    ).toEqual([]);
  });
});

describe("validateDuring", () => {
  it("requires checklist ticks and required fields", () => {
    const during = [
      action({
        type: "require_fields",
        hook: "during",
        config: { fields: ["value"] },
      }),
      action({
        type: "checklist",
        hook: "during",
        config: { items: ["Called", "Emailed"] },
      }),
    ];
    expect(
      validateDuring(
        during,
        { native: { title: "A", value: null, contactIds: [], companyIds: [] }, custom: {} },
        { checklist: { Called: true } },
        [],
      ),
    ).toEqual(["Fill Value", "Tick every checklist item"]);
  });

  it("passes when the payload fills everything", () => {
    const during = [
      action({
        type: "require_fields",
        hook: "during",
        config: { fields: ["value"] },
      }),
      action({
        type: "checklist",
        hook: "during",
        config: { items: ["Called"] },
      }),
    ];
    expect(
      validateDuring(
        during,
        filled,
        { nativePatches: { value: "50" }, checklist: { Called: true } },
        [],
      ),
    ).toEqual([]);
  });
});

describe("actionsForMove / set_field", () => {
  it("runs onLeave then transition then onEnter", () => {
    const grouped = actionsForMove({
      fromActions: [action({ id: "leave", type: "require_fields", hook: "onLeave" })],
      toActions: [action({ id: "enter", type: "notify", hook: "onEnter" })],
      transition: {
        id: "t",
        workflowId: "w",
        name: "Go",
        fromStatusId: "a",
        toStatusId: "b",
        canvasX: null,
        canvasY: null,
        actions: [
          action({ id: "dur", type: "message", hook: "during" }),
          action({ id: "aft", type: "set_field", hook: "after" }),
        ],
      },
    });
    expect(grouped.before.map((a) => a.id)).toEqual(["leave"]);
    expect(grouped.during.map((a) => a.id)).toEqual(["dur"]);
    expect(grouped.after.map((a) => a.id)).toEqual(["aft", "enter"]);
    expect(moveNeedsDialog(grouped.during)).toBe(true);
  });

  it("includes during actions from the destination status", () => {
    const grouped = actionsForMove({
      fromActions: [],
      toActions: [
        action({ id: "need", type: "require_fields", hook: "during", config: { fields: ["title"] } }),
      ],
      transition: {
        id: "t",
        workflowId: "w",
        name: "Go",
        fromStatusId: "a",
        toStatusId: "b",
        canvasX: null,
        canvasY: null,
        actions: [],
      },
    });
    expect(grouped.during.map((a) => a.id)).toEqual(["need"]);
    expect(moveNeedsDialog(grouped.during)).toBe(true);
  });

  it("includes during actions from the status being left", () => {
    const grouped = actionsForMove({
      fromActions: [
        action({ id: "leave-req", type: "require_fields", hook: "during", config: { fields: ["value"] } }),
      ],
      toActions: [],
      transition: {
        id: "t",
        workflowId: "w",
        name: "Go",
        fromStatusId: "lead",
        toStatusId: "qualified",
        canvasX: null,
        canvasY: null,
        actions: [],
      },
    });
    expect(grouped.during.map((a) => a.id)).toEqual(["leave-req"]);
  });

  it("writes configured field values", () => {
    const next = applySetFieldActions(
      [
        action({
          type: "set_field",
          hook: "after",
          config: { field: "value", value: "0" },
        }),
        action({
          type: "set_field",
          hook: "after",
          config: { field: "fld_x", value: "done" },
        }),
      ],
      filled,
    );
    expect(next.native.value).toBe("0");
    expect(next.custom.fld_x).toBe("done");
  });

  it("clears answers hidden after a pick list is set", () => {
    const next = applySetFieldActions(
      [
        action({
          type: "set_field",
          hook: "after",
          config: { field: "type", value: "Personal" },
        }),
      ],
      {
        ...filled,
        custom: { type: "Company", organizer: '["co_1"]' },
      },
      [
        { id: "type", label: "Type", type: "select" },
        {
          id: "organizer",
          label: "Organizer",
          type: "relation",
          visibility: { dependsOn: "type", values: ["Company"] },
        },
      ],
    );
    expect(next.custom.type).toBe("Personal");
    expect(next.custom.organizer).toBe("");
  });

  it("collects require_fields ids", () => {
    expect(
      requiredFieldIds([
        action({ type: "require_fields", hook: "before", config: { fields: ["title", "value"] } }),
      ]),
    ).toEqual(["title", "value"]);
  });
});

describe("snapshotFieldIsFilled", () => {
  const fields = [
    { id: "fld_priority", label: "Priority", type: "select" as const },
    { id: "fld_notes", label: "Notes", type: "textarea" as const },
  ];

  it("treats a filled title and custom value as already answered", () => {
    expect(snapshotFieldIsFilled(filled, "title", fields)).toBe(true);
    expect(snapshotFieldIsFilled(filled, "fld_priority", fields)).toBe(true);
  });

  it("treats a blank custom field as still needed", () => {
    expect(snapshotFieldIsFilled(filled, "fld_notes", fields)).toBe(false);
  });

  it("drops filled fields from the transition prompt list", () => {
    expect(
      unfilledFieldIds(
        ["title", "value", "fld_priority", "fld_notes"],
        filled,
        fields,
      ),
    ).toEqual(["fld_notes"]);
  });
});
