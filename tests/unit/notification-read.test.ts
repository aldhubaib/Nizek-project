import { describe, expect, it } from "vitest";
import {
  inboxThreadIdsFromReadPayload,
  threadPushTag,
} from "@/lib/notification-read";

describe("inboxThreadIdsFromReadPayload", () => {
  it("maps thread tags to inbox row ids", () => {
    expect(
      inboxThreadIdsFromReadPayload({
        tags: ["thread-conv-abc", "thread-project-xyz", "thread-task-nope"],
      }),
    ).toEqual(["conv-abc", "project-xyz"]);
  });

  it("maps inbox linkUrls to row ids", () => {
    expect(
      inboxThreadIdsFromReadPayload({
        linkUrls: [
          "/dashboard/messages/conv-abc",
          "/dashboard/messages/project-xyz?x=1",
          "/dashboard/projects/p/tasks/t",
        ],
      }),
    ).toEqual(["conv-abc", "project-xyz"]);
  });
});

describe("threadPushTag", () => {
  it("prefers conversation, then task, then project", () => {
    expect(threadPushTag({ conversationId: "c1" })).toBe("thread-conv-c1");
    expect(threadPushTag({ taskId: "t1", projectId: "p1" })).toBe(
      "thread-task-t1",
    );
    expect(threadPushTag({ projectId: "p1" })).toBe("thread-project-p1");
    expect(threadPushTag({})).toBeNull();
  });
});
