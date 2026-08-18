import { describe, expect, it } from "vitest";
import { shouldCommitSwipeReply } from "@/lib/swipe-reply";
import { isSoftKeyboardOpen } from "@/lib/soft-keyboard";

describe("shouldCommitSwipeReply", () => {
  it("ignores short or mostly-vertical gestures", () => {
    expect(shouldCommitSwipeReply(40, 0)).toBe(false);
    expect(shouldCommitSwipeReply(80, 50)).toBe(false);
    expect(shouldCommitSwipeReply(10, 80)).toBe(false);
  });

  it("commits a clearly horizontal swipe", () => {
    expect(shouldCommitSwipeReply(80, 10)).toBe(true);
    expect(shouldCommitSwipeReply(72, 0)).toBe(true);
  });
});

describe("isSoftKeyboardOpen", () => {
  it("detects a keyboard against the closed-keyboard baseline", () => {
    expect(
      isSoftKeyboardOpen({
        visualHeight: 400,
        layoutHeight: 400,
        baselineHeight: 800,
      }),
    ).toBe(true);
  });

  it("stays closed when heights match the baseline", () => {
    expect(
      isSoftKeyboardOpen({
        visualHeight: 800,
        layoutHeight: 800,
        baselineHeight: 800,
      }),
    ).toBe(false);
  });
});
