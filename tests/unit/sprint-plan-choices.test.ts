import { describe, expect, it } from "vitest";

import { DECISION_AS_DESCRIBED, isPlanChoiceNone, planChoiceOf, RISK_NONE } from "@/lib/sprint-plan-choices";

describe("planChoiceOf", () => {
  it("reads the stock sentence as the 'nothing' button, words as the written one, and an empty field as no choice yet", () => {
    expect(planChoiceOf(DECISION_AS_DESCRIBED, DECISION_AS_DESCRIBED)).toBe("none");
    expect(planChoiceOf("Build it in-house.", DECISION_AS_DESCRIBED)).toBe("some");
    expect(planChoiceOf("", DECISION_AS_DESCRIBED)).toBeNull();
    expect(planChoiceOf("   ", DECISION_AS_DESCRIBED)).toBeNull();
    expect(planChoiceOf(undefined, RISK_NONE)).toBeNull();
    expect(planChoiceOf(null, RISK_NONE)).toBeNull();
  });

  it("forgives case and punctuation, so 'no risk' typed in the live panel is the No risk button here", () => {
    expect(isPlanChoiceNone("no risk", RISK_NONE)).toBe(true);
    expect(isPlanChoiceNone("No Risk.", RISK_NONE)).toBe(true);
    expect(isPlanChoiceNone(" NO RISK! ", RISK_NONE)).toBe(true);
    expect(isPlanChoiceNone("proceed as described", DECISION_AS_DESCRIBED)).toBe(true);
  });

  it("does not mistake other words, or nothing, for the stock sentence", () => {
    expect(isPlanChoiceNone("No risk if the API is ready.", RISK_NONE)).toBe(false);
    expect(isPlanChoiceNone("Risk: none known.", RISK_NONE)).toBe(false);
    expect(isPlanChoiceNone("", RISK_NONE)).toBe(false);
    expect(planChoiceOf(RISK_NONE, DECISION_AS_DESCRIBED)).toBe("some");
  });
});
