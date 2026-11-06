import { describe, expect, it } from "vitest";

import { getPermissionsFromRole } from "@/lib/permissions";
import { hasTransitions, parseStagePerms, serializeStagePerms, stageGridRows, toggleModify, toggleTransition } from "@/next-ui/screens/projects/role-perms";

/**
 * The stage grid of a role, kept in one JSON column: the moves and, under `_modify`, the stages
 * whose tasks may be edited. What the dialog writes is what `getPermissionsFromRole` reads.
 */

describe("a role's stage grid", () => {
  it("reads the live panel's JSON and writes it back the same way", () => {
    const raw = JSON.stringify({ TODO: ["IN_DEVELOPMENT"], INTERNAL_REVIEW: ["DONE", "IN_DEVELOPMENT"], _modify: ["TODO", "IN_DEVELOPMENT"] });
    const perms = parseStagePerms(raw);
    expect(perms).toEqual({ transitions: { TODO: ["IN_DEVELOPMENT"], INTERNAL_REVIEW: ["DONE", "IN_DEVELOPMENT"] }, modifyStages: ["TODO", "IN_DEVELOPMENT"] });
    expect(serializeStagePerms(perms)).toEqual(JSON.parse(raw));
    // nothing editable: no `_modify` key at all
    expect(serializeStagePerms({ transitions: { TODO: ["IN_DEVELOPMENT"] }, modifyStages: [] })).toEqual({ TODO: ["IN_DEVELOPMENT"] });
  });

  it("takes an empty, missing or broken column as no rights", () => {
    expect(parseStagePerms(null)).toEqual({ transitions: {}, modifyStages: [] });
    expect(parseStagePerms("")).toEqual({ transitions: {}, modifyStages: [] });
    expect(parseStagePerms("{not json")).toEqual({ transitions: {}, modifyStages: [] });
    expect(parseStagePerms(JSON.stringify({ _create: ["TODO"] }))).toEqual({ transitions: {}, modifyStages: [] });
  });

  it("toggles a Modify box and a move, dropping an empty row", () => {
    const start = { transitions: {}, modifyStages: [] };
    const on = toggleModify(start, "TODO");
    expect(on.modifyStages).toEqual(["TODO"]);
    expect(toggleModify(on, "TODO").modifyStages).toEqual([]);
    const moved = toggleTransition(start, "TODO", "IN_DEVELOPMENT");
    expect(moved.transitions).toEqual({ TODO: ["IN_DEVELOPMENT"] });
    expect(hasTransitions(moved)).toBe(true);
    const back = toggleTransition(moved, "TODO", "IN_DEVELOPMENT");
    expect(back.transitions).toEqual({});
    expect(hasTransitions(back)).toBe(false);
  });

  it("offers Forward and Rollback only along the chain a card is moved by hand", () => {
    const rows = stageGridRows();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.BACKLOG).toEqual({ id: "BACKLOG", next: "TODO", prev: null });
    expect(byId.TODO).toEqual({ id: "TODO", next: "IN_DEVELOPMENT", prev: "BACKLOG" });
    expect(byId.INTERNAL_REVIEW).toEqual({ id: "INTERNAL_REVIEW", next: "DONE", prev: "IN_DEVELOPMENT" });
    expect(byId.DONE).toEqual({ id: "DONE", next: null, prev: "INTERNAL_REVIEW" });
    // the sprint-driven stages have no boxes
    expect(byId.PLANNED).toEqual({ id: "PLANNED", next: null, prev: null });
  });

  it("writes what the permission reader understands", () => {
    const perms = toggleModify(toggleTransition({ transitions: {}, modifyStages: [] }, "TODO", "IN_DEVELOPMENT"), "TODO");
    const role = {
      isAdmin: false,
      isClient: false,
      canCreateTask: false,
      canModifyTask: perms.modifyStages.length > 0,
      canMoveTask: hasTransitions(perms),
      canDeleteTask: false,
      canDeclineTask: false,
      isTeamLead: false,
      canCreateSprintPlanning: false,
      canStartSprint: false,
      canEndSprint: false,
      canDeleteSprint: false,
      canViewTaskHistory: false,
      allowedTransitions: JSON.stringify(serializeStagePerms(perms)),
    };
    const read = getPermissionsFromRole(role as never);
    expect(read.canModifyTask).toBe(true);
    expect(read.canMoveTask).toBe(true);
    expect(read.allowedTransitions.TODO).toEqual(["IN_DEVELOPMENT"]);
    expect(read.modifyStages).toEqual(["TODO"]);
  });
});
