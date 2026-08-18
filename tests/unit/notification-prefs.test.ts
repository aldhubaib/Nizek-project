// Preference/mute filtering — decides who gets a notification row, a push,
// and therefore a sound. Server-enforced in notify.ts.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  filterRecipientsByPreferences,
  typeAllowedByPreferences,
  type PreferenceFlags,
} from "@/lib/notification-prefs";

const prefs = (overrides: Partial<PreferenceFlags>): PreferenceFlags => ({
  ...DEFAULT_PREFERENCES,
  ...overrides,
});

describe("typeAllowedByPreferences", () => {
  it("maps each type to its flag", () => {
    expect(typeAllowedByPreferences("message", prefs({ notifyMessages: false }))).toBe(false);
    expect(typeAllowedByPreferences("mention", prefs({ notifyMentions: false }))).toBe(false);
    expect(typeAllowedByPreferences("rejection", prefs({ notifyRejections: false }))).toBe(false);
    expect(typeAllowedByPreferences("deadline", prefs({ notifyDeadlines: false }))).toBe(false);
  });

  it("never drops unknown types (fail open)", () => {
    expect(
      typeAllowedByPreferences(
        "test",
        prefs({
          notifyMessages: false,
          notifyMentions: false,
          notifyRejections: false,
          notifyDeadlines: false,
        }),
      ),
    ).toBe(true);
  });
});

describe("filterRecipientsByPreferences", () => {
  it("keeps everyone with default preferences (no stored rows)", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a", "b", "c"],
      type: "message",
      prefsByUser: new Map(),
      mutedPairs: new Set(),
    });
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("drops users who turned the type off", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a", "b"],
      type: "mention",
      prefsByUser: new Map([["a", prefs({ notifyMentions: false })]]),
      mutedPairs: new Set(),
    });
    expect(out).toEqual(["b"]);
  });

  it("drops users who muted this thread only", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a", "b"],
      type: "message",
      threadKey: "conv-1",
      prefsByUser: new Map(),
      mutedPairs: new Set(["a:conv-1"]),
    });
    expect(out).toEqual(["b"]);
  });

  it("a mute on another thread does not leak", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a"],
      type: "message",
      threadKey: "conv-2",
      prefsByUser: new Map(),
      mutedPairs: new Set(["a:conv-1"]),
    });
    expect(out).toEqual(["a"]);
  });

  it("ignores mutes when the event has no thread (deadlines)", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a"],
      type: "deadline",
      threadKey: null,
      prefsByUser: new Map(),
      mutedPairs: new Set(["a:conv-1"]),
    });
    expect(out).toEqual(["a"]);
  });

  it("combines type toggles and mutes", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["off-type", "muted", "both", "clean"],
      type: "message",
      threadKey: "task-9",
      prefsByUser: new Map([
        ["off-type", prefs({ notifyMessages: false })],
        ["both", prefs({ notifyMessages: false })],
      ]),
      mutedPairs: new Set(["muted:task-9", "both:task-9"]),
    });
    expect(out).toEqual(["clean"]);
  });
});
