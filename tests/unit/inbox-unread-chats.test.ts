import { describe, expect, it } from "vitest";
import { unreadChatCountFromMaps } from "@/lib/inbox-unread-chats";

describe("unreadChatCountFromMaps", () => {
  it("counts chats not messages", () => {
    const messageUnreads = new Map([
      ["conv-a", 4],
      ["conv-b", 1],
      ["project-p", 9],
    ]);
    expect(
      unreadChatCountFromMaps({
        messageUnreads,
        noteCommentThreadIds: [],
      }),
    ).toBe(3);
  });

  it("excludes note-comment threads", () => {
    const messageUnreads = new Map([
      ["conv-a", 2],
      ["conv-note", 5],
      ["project-p", 1],
    ]);
    expect(
      unreadChatCountFromMaps({
        messageUnreads,
        noteCommentThreadIds: ["note"],
      }),
    ).toBe(2);
  });

  it("includes marked-unread chats with zero message unreads", () => {
    const messageUnreads = new Map([["conv-a", 1]]);
    expect(
      unreadChatCountFromMaps({
        messageUnreads,
        noteCommentThreadIds: [],
        markedUnreadThreadIds: ["conv-b", "conv-a"],
      }),
    ).toBe(2);
  });

  it("ignores zero and note marked-unread rows", () => {
    const messageUnreads = new Map([["conv-a", 0]]);
    expect(
      unreadChatCountFromMaps({
        messageUnreads,
        noteCommentThreadIds: ["hidden"],
        markedUnreadThreadIds: ["conv-hidden"],
      }),
    ).toBe(0);
  });
});
