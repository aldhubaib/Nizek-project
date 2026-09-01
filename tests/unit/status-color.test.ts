import { describe, it, expect } from "vitest";
import {
  STATUS_COLOR,
  SPRINT_STATUS_BADGE,
  TASK_STAGE_BADGE,
  TASK_STAGE_DOT,
  statusDot,
} from "@/lib/task-label";
import { STAGE_ORDER } from "@/lib/task-stage";

/** The columns that sit side by side on one screen, so they must not collide. */
const BOARD_COLUMNS = ["BACKLOG", "TODO", "IN_DEVELOPMENT", "INTERNAL_REVIEW", "DONE"];
const ROADMAP_COLUMNS = [
  "MISSING_DATA",
  "BACKLOG",
  "PLANNED",
  "NEXT",
  "ACTIVE",
  "COMPLETED",
  "SHIPPED",
];

describe("status colours", () => {
  it("gives every status its own colour", () => {
    const dots = Object.values(STATUS_COLOR).map((c) => c.dot);
    expect(new Set(dots).size).toBe(dots.length);
  });

  it("keeps the active sprint board columns distinct", () => {
    const dots = BOARD_COLUMNS.map(statusDot);
    expect(new Set(dots).size).toBe(BOARD_COLUMNS.length);
  });

  it("keeps the roadmap columns distinct", () => {
    const dots = ROADMAP_COLUMNS.map(statusDot);
    expect(new Set(dots).size).toBe(ROADMAP_COLUMNS.length);
  });

  it("covers every task stage", () => {
    for (const stage of STAGE_ORDER) {
      expect(STATUS_COLOR[stage], stage).toBeDefined();
    }
  });

  it("derives the badge and the dot from the same entry, so a recolour reaches both", () => {
    // The point of the single palette: no second list to keep in step.
    for (const stage of STAGE_ORDER) {
      const palette = STATUS_COLOR[stage];
      expect(TASK_STAGE_DOT[stage]).toBe(palette.dot);
      expect(TASK_STAGE_BADGE[stage].color).toBe(palette.text);
      expect(TASK_STAGE_BADGE[stage].bg).toContain(palette.border);
    }
  });

  it("colours a sprint the same as the stage of the same name", () => {
    for (const status of ["PLANNED", "NEXT", "COMPLETED", "SHIPPED"]) {
      expect(SPRINT_STATUS_BADGE[status].color).toBe(STATUS_COLOR[status].text);
    }
  });

  it("falls back to a neutral for an unknown status rather than throwing", () => {
    expect(statusDot("NOT_A_STATUS")).toBe("bg-muted-foreground");
  });
});
