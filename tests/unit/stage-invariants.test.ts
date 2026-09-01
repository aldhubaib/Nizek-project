import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  WORK_STAGES,
  LIFECYCLE_STAGES,
  isStageValidForSprint,
  stageForSprintStatus,
  isFinishedStage,
  isRegression,
  isWorkStage,
} from "@/lib/task-stage";
import { ACTIVE_STAGES } from "@/lib/audit-flags";
import { STAGE_ORDER } from "@/types";
import type { Stage } from "@/generated/prisma/client";

const ALL_STAGES = [...LIFECYCLE_STAGES, ...WORK_STAGES] as Stage[];
const SPRINT_STATUSES = [
  "PLANNED",
  "NEXT",
  "ACTIVE",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "SHIPPED",
] as const;

describe("the stage / sprint invariants", () => {
  it("covers the nine unified values exactly once, in lifecycle order", () => {
    expect([...STAGE_ORDER].sort()).toEqual([...ALL_STAGES].sort());
    expect(STAGE_ORDER).toEqual([
      "BACKLOG",
      "PLANNED",
      "NEXT",
      "TODO",
      "IN_DEVELOPMENT",
      "INTERNAL_REVIEW",
      "DONE",
      "COMPLETED",
      "SHIPPED",
    ]);
  });

  it("Backlog means no sprint, and no sprint means Backlog", () => {
    expect(isStageValidForSprint("BACKLOG", null)).toBe(true);
    expect(stageForSprintStatus(null)).toBe("BACKLOG");
    for (const status of SPRINT_STATUSES) {
      expect(isStageValidForSprint("BACKLOG", status)).toBe(false);
    }
  });

  it("Planned and Next require the sprint to be in that same status", () => {
    expect(isStageValidForSprint("PLANNED", "PLANNED")).toBe(true);
    expect(isStageValidForSprint("NEXT", "NEXT")).toBe(true);
    expect(isStageValidForSprint("PLANNED", "NEXT")).toBe(false);
    expect(isStageValidForSprint("NEXT", "PLANNED")).toBe(false);
    expect(isStageValidForSprint("PLANNED", null)).toBe(false);
  });

  it("the four work stages require an ACTIVE sprint and nothing else", () => {
    for (const stage of WORK_STAGES) {
      expect(isStageValidForSprint(stage, "ACTIVE")).toBe(true);
      for (const status of SPRINT_STATUSES.filter((s) => s !== "ACTIVE")) {
        expect(isStageValidForSprint(stage, status)).toBe(false);
      }
      expect(isStageValidForSprint(stage, null)).toBe(false);
    }
    // An active sprint hands control to the work stages, so there is no single
    // stage to project onto its tasks.
    expect(stageForSprintStatus("ACTIVE")).toBeNull();
  });

  it("Completed covers both completed and partially completed sprints", () => {
    expect(isStageValidForSprint("COMPLETED", "COMPLETED")).toBe(true);
    expect(isStageValidForSprint("COMPLETED", "PARTIALLY_COMPLETED")).toBe(true);
    expect(isStageValidForSprint("COMPLETED", "SHIPPED")).toBe(false);
  });

  it("Shipped requires the sprint to be shipped", () => {
    expect(isStageValidForSprint("SHIPPED", "SHIPPED")).toBe(true);
    expect(isStageValidForSprint("SHIPPED", "COMPLETED")).toBe(false);
  });

  it("every stage has exactly one sprint status it is valid under", () => {
    for (const stage of ALL_STAGES) {
      const valid = [null, ...SPRINT_STATUSES].filter((s) => isStageValidForSprint(stage, s));
      // Completed is the one stage with two, since a partially completed sprint
      // is still a completed one as far as its tasks are concerned.
      expect(valid.length).toBe(stage === "COMPLETED" ? 2 : 1);
    }
  });

  it("work and lifecycle stages are disjoint", () => {
    for (const stage of WORK_STAGES) expect(isWorkStage(stage)).toBe(true);
    for (const stage of LIFECYCLE_STAGES) expect(isWorkStage(stage)).toBe(false);
  });
});

describe("client review is per sprint and optional", () => {
  it("treats Completed as finished, equal in standing to Shipped", () => {
    expect(isFinishedStage("COMPLETED")).toBe(true);
    expect(isFinishedStage("SHIPPED")).toBe(true);
    expect(isFinishedStage("DONE")).toBe(false);
  });

  it("never flags a task parked in Completed as late", () => {
    // A sprint may sit in Completed forever and that is a correct outcome, not
    // a pending one. Same for Done, where the only thing left is the sprint
    // closing, which is not the assignee's to do.
    expect(ACTIVE_STAGES).toEqual(["TODO", "IN_DEVELOPMENT", "INTERNAL_REVIEW"]);
    for (const stage of LIFECYCLE_STAGES) {
      expect(ACTIVE_STAGES as readonly string[]).not.toContain(stage);
    }
  });

  it("has no per-task client review stage left to gate anything", () => {
    expect(ALL_STAGES).not.toContain("CLIENT_REVIEW");
    expect(ALL_STAGES).not.toContain("READY_FOR_RELEASE");
    expect(ALL_STAGES).not.toContain("CLARIFICATION");
  });
});

describe("regressions", () => {
  it("counts declines and sprint pushbacks, not forward moves", () => {
    expect(isRegression("INTERNAL_REVIEW", "IN_DEVELOPMENT")).toBe(true);
    expect(isRegression("IN_DEVELOPMENT", "BACKLOG")).toBe(true);
    expect(isRegression("SHIPPED", "COMPLETED")).toBe(true);
    expect(isRegression("TODO", "IN_DEVELOPMENT")).toBe(false);
    expect(isRegression("DONE", "COMPLETED")).toBe(false);
    expect(isRegression(null, "BACKLOG")).toBe(false);
  });
});

describe("stage writes are confined to the two files that own them", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

  /** Any Prisma write on Task that sets `stage`. The `[^;]` stops the match
   *  running past the end of the call into an unrelated later statement. */
  const STAGE_WRITE = /task\.(update|updateMany|create|createMany)\(\{[^;]{0,600}?stage:/g;

  it("only task.ts and sprint.ts write Task.stage", () => {
    // Every other module must go through those actions. If this fails, a new
    // write path was added somewhere that cannot record who made the move.
    const suspects = [
      "src/actions/team.ts",
      "src/actions/project.ts",
      "src/actions/task-highlight-comment.ts",
      "src/actions/audit.ts",
      "src/actions/client-project.ts",
      "src/actions/task-detail-panel.ts",
    ];
    for (const file of suspects) {
      expect(read(file).match(STAGE_WRITE), `${file} writes Task.stage`).toBeNull();
    }
  });

  it("both files that do write it also route through the stage helper", () => {
    for (const file of ["src/actions/task.ts", "src/actions/sprint.ts"]) {
      const src = read(file);
      expect(src.match(STAGE_WRITE)).not.toBeNull();
      expect(src).toContain('from "@/lib/stage-transition"');
      expect(/applyStageChange|applyBulkStageChange/.test(src)).toBe(true);
    }
  });

  it("every stage write is paired with a helper call", () => {
    // Not a proof, but it catches the shape of the old bug: four of six write
    // paths changed the stage and logged nothing at all.
    for (const file of ["src/actions/task.ts", "src/actions/sprint.ts"]) {
      const src = read(file);
      const writes = src.match(STAGE_WRITE)?.length ?? 0;
      const helperCalls = src.match(/apply(Bulk)?StageChange\(/g)?.length ?? 0;
      // Declarations and imports do not count as calls, so subtract the module
      // that defines them (neither of these does).
      expect(helperCalls, `${file}: ${writes} stage writes, ${helperCalls} helper calls`)
        .toBeGreaterThanOrEqual(writes);
    }
  });
});
