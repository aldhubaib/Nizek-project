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
  it("only counts questions marked mandatory or required before backlog", () => {
    expect(isReadinessQuestion({ type: "text" })).toBe(false);
    expect(isReadinessQuestion({ type: "text", required: true })).toBe(true);
    expect(isReadinessQuestion({ type: "select", mandatory: true })).toBe(true);
  });

  it("ignores client questions", () => {
    expect(isReadinessQuestion({ type: "client" })).toBe(false);
  });

  it("ignores Priority — that field lives on the task, not in questions", () => {
    expect(isReadinessQuestion({ type: "text", question: "Priority", required: true })).toBe(false);
    expect(isReadinessQuestion({ type: "select", question: "priority", mandatory: true })).toBe(false);
  });
});

describe("computeIsReadyForTransition", () => {
  it("keeps a task in Missing Data when required questions are unanswered", () => {
    expect(computeIsReadyForTransition([spec("q1", true), spec("q2", true)], {})).toBe(false);
  });

  it("treats required:false as optional for the Backlog split", () => {
    expect(
      computeIsReadyForTransition([spec("q1", false)], {}),
    ).toBe(true);
  });

  it("is ready only after every required question has an answer", () => {
    expect(
      computeIsReadyForTransition(
        [spec("q1", false), spec("q2", true)],
        { q2: "two" },
      ),
    ).toBe(true);
  });

  it("stays unready if a required select/file answer is an empty list", () => {
    expect(
      computeIsReadyForTransition(
        [{ id: "files", type: "file", required: true }],
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

  it("does not keep a task in Missing Data for an unanswered Priority question", () => {
    expect(
      computeIsReadyForTransition(
        [{ id: "p1", type: "text", question: "Priority", required: true }],
        {},
      ),
    ).toBe(true);
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
