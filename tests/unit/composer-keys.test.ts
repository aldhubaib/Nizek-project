// Enter-to-send policy for the chat and comment composers ("in web, Enter does
// not send" was one of the team's top complaints).

import { describe, expect, it } from "vitest";
import { shouldSendOnEnter } from "@/lib/composer-keys";

const enter = (extra: Partial<Parameters<typeof shouldSendOnEnter>[0]> = {}) => ({
  key: "Enter",
  shiftKey: false,
  ...extra,
});

describe("shouldSendOnEnter", () => {
  it("desktop: Enter sends, Shift+Enter is a new line", () => {
    expect(shouldSendOnEnter(enter(), true)).toBe(true);
    expect(shouldSendOnEnter(enter({ shiftKey: true }), true)).toBe(false);
    expect(shouldSendOnEnter(enter({ altKey: true }), true)).toBe(false);
  });

  it("touch devices: Enter stays a new line, the Send button sends", () => {
    expect(shouldSendOnEnter(enter(), false)).toBe(false);
  });

  it("Ctrl/Cmd+Enter sends everywhere (external keyboards on tablets)", () => {
    expect(shouldSendOnEnter(enter({ ctrlKey: true }), false)).toBe(true);
    expect(shouldSendOnEnter(enter({ metaKey: true }), false)).toBe(true);
  });

  it("never sends mid-IME composition or on other keys", () => {
    expect(shouldSendOnEnter(enter({ isComposing: true }), true)).toBe(false);
    expect(shouldSendOnEnter({ key: "a", shiftKey: false }, true)).toBe(false);
    expect(shouldSendOnEnter({ key: "Tab", shiftKey: false }, true)).toBe(false);
  });
});
