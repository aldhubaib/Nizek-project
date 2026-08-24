import { describe, expect, it } from "vitest";
import {
  computeIsReadyForTransition,
  isMissingDataTask,
  isQuestionAnswerFilled,
  isReadinessQuestion,
} from "@/lib/task-readiness";

const spec = (id: string, required = false) => ({
  id,
  type: "text" as const,
  required,
});

describe("isReadinessQuestion", () => {
  it("counts spec questions even when they are not marked required", () => {
    expect(isReadinessQuestion({ type: "text" })).toBe(true);
    expect(isReadinessQuestion({ type: "select" })).toBe(true);
  });

  it("ignores client questions", () => {
    expect(isReadinessQuestion({ type: "client" })).toBe(false);
  });
});

describe("computeIsReadyForTransition", () => {
  it("keeps a task in Missing Data when spec questions are unanswered", () => {
    expect(computeIsReadyForTransition([spec("q1"), spec("q2")], {})).toBe(false);
  });

  it("does not treat required:false as optional for the Backlog split", () => {
    expect(
      computeIsReadyForTransition([spec("q1", false)], {}),
    ).toBe(false);
  });

  it("is ready only after every spec question has an answer", () => {
    expect(
      computeIsReadyForTransition(
        [spec("q1", false), spec("q2", true)],
        { q1: "one", q2: "two" },
      ),
    ).toBe(true);
  });

  it("stays unready if a select/file answer is an empty list", () => {
    expect(
      computeIsReadyForTransition(
        [{ id: "files", type: "file" }],
        { files: "[]" },
      ),
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
});

describe("isMissingDataTask", () => {
  it("is true for backlog-stage work that is not ready", () => {
    expect(
      isMissingDataTask({ stage: "NEW_REQUEST", isReadyForTransition: false }),
    ).toBe(true);
    expect(
      isMissingDataTask({ stage: "NEW_REQUEST", isReadyForTransition: true }),
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
