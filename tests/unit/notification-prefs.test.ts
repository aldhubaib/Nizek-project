// Preference / per-thread level filtering — decides who gets a notification
// row, a push, and therefore a sound. Server-enforced in notify.ts.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  defaultThreadLevel,
  effectiveThreadLevel,
  filterRecipientsByPreferences,
  isThreadNotificationLevel,
  typeAllowedByPreferences,
  type PreferenceFlags,
  type ThreadNotificationLevel,
} from "@/lib/notification-prefs";

const prefs = (overrides: Partial<PreferenceFlags>): PreferenceFlags => ({
  ...DEFAULT_PREFERENCES,
  ...overrides,
});

const levels = (entries: Record<string, ThreadNotificationLevel>) =>
  new Map(Object.entries(entries));

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

describe("thread levels", () => {
  it("defaults conversations to every message and project/task threads to mentions", () => {
    expect(defaultThreadLevel("conv-1")).toBe("all");
    expect(defaultThreadLevel("project-1")).toBe("mentions");
    expect(defaultThreadLevel("task-1")).toBe("mentions");
    expect(defaultThreadLevel(null)).toBe("all");
  });

  it("a stored choice wins over the default", () => {
    expect(effectiveThreadLevel("project-1", "all")).toBe("all");
    expect(effectiveThreadLevel("conv-1", "none")).toBe("none");
    expect(effectiveThreadLevel("conv-1", null)).toBe("all");
  });

  it("validates level strings", () => {
    expect(isThreadNotificationLevel("all")).toBe(true);
    expect(isThreadNotificationLevel("mentions")).toBe(true);
    expect(isThreadNotificationLevel("none")).toBe(true);
    expect(isThreadNotificationLevel("muted")).toBe(false);
    expect(isThreadNotificationLevel(null)).toBe(false);
  });
});

describe("filterRecipientsByPreferences", () => {
  it("keeps everyone in a conversation with no stored rows", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a", "b", "c"],
      type: "message",
      threadKey: "conv-1",
      prefsByUser: new Map(),
    });
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("drops users who turned the type off", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a", "b"],
      type: "mention",
      prefsByUser: new Map([["a", prefs({ notifyMentions: false })]]),
    });
    expect(out).toEqual(["b"]);
  });

  it("level none silences the person (levels are loaded per thread by the caller)", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a", "b"],
      type: "message",
      threadKey: "conv-1",
      prefsByUser: new Map(),
      levelsByUser: levels({ a: "none" }),
    });
    expect(out).toEqual(["b"]);
    // No stored level for this thread → the default applies again.
    const other = filterRecipientsByPreferences({
      recipientIds: ["a"],
      type: "message",
      threadKey: "conv-2",
      prefsByUser: new Map(),
      levelsByUser: new Map(),
    });
    expect(other).toEqual(["a"]);
  });

  it("project threads notify only the mentioned by default", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["mentioned", "quiet"],
      type: "message",
      threadKey: "project-1",
      prefsByUser: new Map(),
      mentionedIds: ["mentioned"],
    });
    expect(out).toEqual(["mentioned"]);
  });

  it("a member who chose every message gets unmentioned project messages", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["eager", "quiet"],
      type: "message",
      threadKey: "project-1",
      prefsByUser: new Map(),
      levelsByUser: levels({ eager: "all" }),
      mentionedIds: [],
    });
    expect(out).toEqual(["eager"]);
  });

  it("a member who chose mentions only in a group skips plain messages", () => {
    const plain = filterRecipientsByPreferences({
      recipientIds: ["picky", "normal"],
      type: "message",
      threadKey: "conv-9",
      prefsByUser: new Map(),
      levelsByUser: levels({ picky: "mentions" }),
      mentionedIds: [],
    });
    expect(plain).toEqual(["normal"]);
    const named = filterRecipientsByPreferences({
      recipientIds: ["picky", "normal"],
      type: "message",
      threadKey: "conv-9",
      prefsByUser: new Map(),
      levelsByUser: levels({ picky: "mentions" }),
      mentionedIds: ["picky"],
    });
    expect(named).toEqual(["picky", "normal"]);
  });

  it("personal types (mention, rejection) count as a mention", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a"],
      type: "rejection",
      threadKey: "task-3",
      prefsByUser: new Map(),
    });
    expect(out).toEqual(["a"]);
  });

  it("none beats a mention", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a"],
      type: "mention",
      threadKey: "task-3",
      prefsByUser: new Map(),
      levelsByUser: levels({ a: "none" }),
      mentionedIds: ["a"],
    });
    expect(out).toEqual([]);
  });

  it("ignores levels when the event has no thread (deadlines)", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["a"],
      type: "deadline",
      threadKey: null,
      prefsByUser: new Map(),
      levelsByUser: levels({ a: "none" }),
    });
    expect(out).toEqual(["a"]);
  });

  it("combines type toggles and levels", () => {
    const out = filterRecipientsByPreferences({
      recipientIds: ["off-type", "silenced", "both", "clean"],
      type: "message",
      threadKey: "conv-9",
      prefsByUser: new Map([
        ["off-type", prefs({ notifyMessages: false })],
        ["both", prefs({ notifyMessages: false })],
      ]),
      levelsByUser: levels({ silenced: "none", both: "none" }),
    });
    expect(out).toEqual(["clean"]);
  });
});
