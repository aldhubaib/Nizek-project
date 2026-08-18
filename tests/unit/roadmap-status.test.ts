import { describe, expect, it } from "vitest";
import {
  ROADMAP_NEXT_FULL_ERROR,
  roadmapAllowsCreateTask,
  roadmapCreateTaskError,
  roadmapNextColumnError,
  roadmapScheduleError,
} from "@/lib/roadmap-status";

describe("roadmapScheduleError", () => {
  it("allows Planned and Next with nothing filled in", () => {
    expect(roadmapScheduleError("PLANNED", null, null)).toBeNull();
    expect(roadmapScheduleError("NEXT", null, null)).toBeNull();
  });

  it("blocks In Progress until Efforts are set", () => {
    expect(roadmapScheduleError("PROGRESS", null, null)).toMatch(/Please enter the Efforts/);
    expect(roadmapScheduleError("PROGRESS", null, 3)).toBeNull();
  });

  it("blocks Shipped until Efforts and a due date exist", () => {
    expect(roadmapScheduleError("SHIPPED", null, 2)).toMatch(/due date/);
    expect(roadmapScheduleError("SHIPPED", "2026-08-20", 2)).toBeNull();
  });
});

describe("roadmapNextColumnError", () => {
  it("allows up to 3 items in Next", () => {
    expect(roadmapNextColumnError(2)).toBeNull();
    expect(roadmapNextColumnError(3)).toBe(ROADMAP_NEXT_FULL_ERROR);
  });
});

describe("roadmapAllowsCreateTask", () => {
  it("blocks Planned and Next", () => {
    expect(roadmapAllowsCreateTask("PLANNED")).toBe(false);
    expect(roadmapAllowsCreateTask("NEXT")).toBe(false);
    expect(roadmapCreateTaskError("PLANNED")).toMatch(/In Progress/);
    expect(roadmapCreateTaskError("NEXT")).toMatch(/In Progress/);
  });

  it("allows In Progress and Shipped", () => {
    expect(roadmapAllowsCreateTask("PROGRESS")).toBe(true);
    expect(roadmapAllowsCreateTask("SHIPPED")).toBe(true);
    expect(roadmapCreateTaskError("PROGRESS")).toBeNull();
    expect(roadmapCreateTaskError("SHIPPED")).toBeNull();
  });
});
