import { describe, expect, it } from "vitest";
import { roadmapAllowsCreateTask, roadmapCreateTaskError, roadmapScheduleError } from "@/lib/roadmap-status";

describe("roadmapScheduleError", () => {
  it("allows Planned with nothing filled in", () => {
    expect(roadmapScheduleError("PLANNED", null, null)).toBeNull();
  });

  it("blocks Next until due date and working days are set", () => {
    expect(roadmapScheduleError("NEXT", null, null)).toMatch(/due date and working days/);
    expect(roadmapScheduleError("NEXT", "2026-08-20", null)).toMatch(/working days/);
    expect(roadmapScheduleError("NEXT", null, 3)).toMatch(/due date/);
    expect(roadmapScheduleError("NEXT", "2026-08-20", 3)).toBeNull();
  });

  it("applies the same gate to In Progress and Shipped", () => {
    expect(roadmapScheduleError("PROGRESS", null, 2)).toMatch(/due date/);
    expect(roadmapScheduleError("SHIPPED", "2026-08-20", 2)).toBeNull();
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
