import { describe, expect, it, vi } from "vitest";
import {
  channelForInboxThreadId,
  recordThreadDelivered,
  type DeliveryCursorDb,
} from "@/lib/chat-delivery";

describe("channelForInboxThreadId", () => {
  it("maps conversation and project thread ids to Centrifugo channels", () => {
    expect(channelForInboxThreadId("conv-abc")).toBe("conv:abc");
    expect(channelForInboxThreadId("project-p1")).toBe("project:p1");
    expect(channelForInboxThreadId("conv-announcements")).toBe("conv:announcements");
    expect(channelForInboxThreadId("task-t1")).toBeNull();
  });
});

describe("recordThreadDelivered", () => {
  it("broadcasts thread.delivered only for recipients whose cursor advanced", async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const db: DeliveryCursorDb = { chatReadCursor: { updateMany } };
    const publish = vi.fn().mockResolvedValue(undefined);
    const at = new Date("2026-11-22T12:00:00.000Z");

    const advanced = await recordThreadDelivered(db, publish, {
      threadId: "project-p1",
      userIds: ["u1", "u2", "u1"],
      at,
    });

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(advanced).toEqual(["u1"]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(["project:p1"], {
      type: "thread.delivered",
      memberId: "u1",
      lastDeliveredAt: at.toISOString(),
    });
  });

  it("no-ops for unsupported thread ids", async () => {
    const updateMany = vi.fn();
    const db: DeliveryCursorDb = { chatReadCursor: { updateMany } };
    const publish = vi.fn();

    const advanced = await recordThreadDelivered(db, publish, {
      threadId: "task-t1",
      userIds: ["u1"],
    });

    expect(advanced).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
