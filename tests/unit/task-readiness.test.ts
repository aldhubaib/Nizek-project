import { describe, expect, it } from "vitest";
import {
  computeIsReadyForTransition,
  isMissingDataTask,
  isQuestionAnswerFilled,
  isReadinessQuestion,
} from "@/lib/task-readiness";

const spec = (id: string) => ({ id, type: "text" as const });

describe("isReadinessQuestion", () => {
  it("counts every question, however it is flagged", () => {
    expect(isReadinessQuestion({ type: "text" })).toBe(true);
    expect(isReadinessQuestion({ type: "select" })).toBe(true);
  });

  it("ignores client questions", () => {
    expect(isReadinessQuestion({ type: "client" })).toBe(false);
  });

  it("ignores Priority — that field lives on the task, not in questions", () => {
    expect(isReadinessQuestion({ type: "text", question: "Priority" })).toBe(false);
    expect(isReadinessQuestion({ type: "select", question: "priority" })).toBe(false);
  });
});

describe("computeIsReadyForTransition", () => {
  it("keeps a task in Missing Data when questions are unanswered", () => {
    expect(computeIsReadyForTransition([spec("q1"), spec("q2")], {})).toBe(false);
  });

  it("holds the task for an unflagged question, which used to count as optional", () => {
    expect(computeIsReadyForTransition([spec("q1")], {})).toBe(false);
  });

  it("is ready only once every question has an answer", () => {
    expect(
      computeIsReadyForTransition([spec("q1"), spec("q2")], { q2: "two" }),
    ).toBe(false);
    expect(
      computeIsReadyForTransition([spec("q1"), spec("q2")], { q1: "one", q2: "two" }),
    ).toBe(true);
  });

  it("stays unready if a select/file answer is an empty list", () => {
    expect(
      computeIsReadyForTransition([{ id: "files", type: "file" }], { files: "[]" }),
    ).toBe(false);
  });

  it("ignores client questions unless waiting on the client", () => {
    const client = { id: "c1", type: "client" };
    expect(computeIsReadyForTransition([client], {})).toBe(true);
    expect(
      computeIsReadyForTransition(
        [client],
        { c1: JSON.stringify({ needed: true, completed: false }) },
      ),
    ).toBe(false);
  });

  it("does not keep a task in Missing Data for an unanswered Priority question", () => {
    expect(
      computeIsReadyForTransition([{ id: "p1", type: "text", question: "Priority" }], {}),
    ).toBe(true);
  });
});

describe("isMissingDataTask", () => {
  it("is true for backlog-stage work that is not ready", () => {
    expect(
      isMissingDataTask({ stage: "BACKLOG", isReadyForTransition: false }),
    ).toBe(true);
    expect(
      isMissingDataTask({ stage: "BACKLOG", isReadyForTransition: true }),
    ).toBe(false);
  });
});

describe("isQuestionAnswerFilled", () => {
  it("rejects blanks", () => {
    expect(isQuestionAnswerFilled("text", "")).toBe(false);
    expect(isQuestionAnswerFilled("text", "  ")).toBe(false);
    expect(isQuestionAnswerFilled("text", "done")).toBe(true);
  });
});
