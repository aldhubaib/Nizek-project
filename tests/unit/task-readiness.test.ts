import { describe, expect, it } from "vitest";
import {
  computeIsReadyForTransition,
  isMissingDataTask,
  isQuestionAnswerFilled,
  isReadinessQuestion,
} from "@/lib/task-readiness";

const spec = (id: string) => ({ id, type: "text" as const, mandatory: true });
const optional = (id: string) => ({ id, type: "text" as const, mandatory: false });

describe("isReadinessQuestion", () => {
  it("counts mandatory questions", () => {
    expect(isReadinessQuestion({ type: "text", mandatory: true })).toBe(true);
    expect(isReadinessQuestion({ type: "select", mandatory: true })).toBe(true);
  });

  it("ignores optional questions — skipping one is a choice, not an omission", () => {
    expect(isReadinessQuestion({ type: "text", mandatory: false })).toBe(false);
    expect(isReadinessQuestion({ type: "file", mandatory: false })).toBe(false);
  });

  it("ignores client questions", () => {
    expect(isReadinessQuestion({ type: "client", mandatory: true })).toBe(false);
  });

  it("ignores Priority — that field lives on the task, not in questions", () => {
    expect(
      isReadinessQuestion({ type: "text", question: "Priority", mandatory: true }),
    ).toBe(false);
    expect(
      isReadinessQuestion({ type: "select", question: "priority", mandatory: true }),
    ).toBe(false);
  });
});

describe("computeIsReadyForTransition", () => {
  it("keeps a task in Missing Data when mandatory questions are unanswered", () => {
    expect(computeIsReadyForTransition([spec("q1"), spec("q2")], {})).toBe(false);
  });

  it("does not hold the task for a blank optional question", () => {
    expect(computeIsReadyForTransition([optional("q1")], {})).toBe(true);
    expect(
      computeIsReadyForTransition([spec("q1"), optional("q2")], { q1: "one" }),
    ).toBe(true);
  });

  it("is ready only once every mandatory question has an answer", () => {
    expect(
      computeIsReadyForTransition([spec("q1"), spec("q2")], { q2: "two" }),
    ).toBe(false);
    expect(
      computeIsReadyForTransition([spec("q1"), spec("q2")], { q1: "one", q2: "two" }),
    ).toBe(true);
  });

  it("stays unready if a mandatory select/file answer is an empty list", () => {
    expect(
      computeIsReadyForTransition(
        [{ id: "files", type: "file", mandatory: true }],
        { files: "[]" },
      ),
    ).toBe(false);
  });

  it("lets a blank optional attachment through", () => {
    expect(
      computeIsReadyForTransition(
        [{ id: "files", type: "file", mandatory: false }],
        { files: "[]" },
      ),
    ).toBe(true);
  });

  it("ignores client questions unless waiting on the client", () => {
    const client = { id: "c1", type: "client", mandatory: true };
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
        [{ id: "p1", type: "text", question: "Priority", mandatory: true }],
        {},
      ),
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
