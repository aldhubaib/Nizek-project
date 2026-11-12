import { describe, expect, it } from "vitest";
import { mobileInboxThreads } from "../../src/app/api/mobile/inbox/route";
import type { InboxThread } from "../../src/actions/messages";

function thread(partial: Partial<InboxThread> & Pick<InboxThread, "id">): InboxThread {
  return {
    kind: "direct",
    name: partial.id,
    subtitle: "",
    projectId: null,
    conversationId: null,
    logoUrl: null,
    peerImageUrl: null,
    peerMemberIds: [],
    lastMessage: "",
    lastAuthor: "",
    lastAt: "",
    unread: 0,
    avatar: "#000",
    initials: "N",
    inactive: false,
    ...partial,
  };
}

describe("mobileInboxThreads", () => {
  it("drops note comment threads and keeps everything else", () => {
    const threads = [
      thread({ id: "project-1", kind: "project" }),
      thread({ id: "conv-note", noteComment: true }),
      thread({ id: "conv-dm", oneToOne: true }),
      thread({ id: "conv-task" }),
    ];
    expect(mobileInboxThreads(threads)?.map((t) => t.id)).toEqual([
      "project-1",
      "conv-dm",
      "conv-task",
    ]);
  });

  it("leaves a no-change result alone", () => {
    expect(mobileInboxThreads(null)).toBeNull();
  });
});
