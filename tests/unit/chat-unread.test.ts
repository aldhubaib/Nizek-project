import { describe, expect, it } from "vitest";
import { firstUnreadMessageId, formatUnreadBadge, formatUnreadSeparator } from "@/lib/chat-unread";

describe("firstUnreadMessageId", () => {
  const msgs = [
    { id: "a", authorId: "me", createdAt: "2026-08-16T10:00:00.000Z" },
    { id: "b", authorId: "you", createdAt: "2026-08-16T10:01:00.000Z" },
    { id: "c", authorId: "you", createdAt: "2026-08-16T10:02:00.000Z" },
  ];

  it("returns null when there is no last-read cursor", () => {
    expect(firstUnreadMessageId(msgs, "me", null)).toBeNull();
  });

  it("skips the viewer's own messages", () => {
    expect(firstUnreadMessageId(msgs, "me", "2026-08-16T09:59:00.000Z")).toBe("b");
  });

  it("returns the first message after lastReadAt", () => {
    expect(firstUnreadMessageId(msgs, "me", "2026-08-16T10:01:00.000Z")).toBe("c");
  });

  it("returns null when everything is already read", () => {
    expect(firstUnreadMessageId(msgs, "me", "2026-08-16T10:03:00.000Z")).toBeNull();
  });
});

describe("formatUnreadSeparator", () => {
  it("pluralizes", () => {
    expect(formatUnreadSeparator(0)).toBe("");
    expect(formatUnreadSeparator(1)).toBe("1 unread message");
    expect(formatUnreadSeparator(18)).toBe("18 unread messages");
  });
});

describe("formatUnreadBadge", () => {
  it("caps at 99+", () => {
    expect(formatUnreadBadge(0)).toBe("");
    expect(formatUnreadBadge(2)).toBe("2");
    expect(formatUnreadBadge(99)).toBe("99");
    expect(formatUnreadBadge(100)).toBe("99+");
  });
});
