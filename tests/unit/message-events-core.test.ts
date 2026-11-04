import { describe, expect, it, vi } from "vitest";
import {
  MESSAGE_EVENT_JOB_ATTEMPTS,
  enqueueMessageEvents,
  messageEventJobId,
  parseMessageEventPayload,
  publishIdempotencyKey,
  sweepMessageEvents,
  type MessageEventQueueLike,
} from "@/lib/message-events-core";

function fakeQueue() {
  const calls: Array<{ name: string; data: unknown; opts: { jobId: string } }> = [];
  const queue: MessageEventQueueLike = {
    add: async (name, data, opts) => {
      calls.push({ name, data, opts });
    },
  };
  return { queue, calls };
}

describe("job identity", () => {
  it("changes the job id when the row's attempt counter changes", () => {
    expect(messageEventJobId({ id: "e1", attempts: 0 })).toBe("evt-e1-0");
    expect(messageEventJobId({ id: "e1", attempts: 5 })).toBe("evt-e1-5");
  });

  it("gives every publish of an event its own idempotency key", () => {
    expect(publishIdempotencyKey("e1", 0)).toBe("e1:0");
    expect(publishIdempotencyKey("e1", 1)).not.toBe(publishIdempotencyKey("e1", 0));
  });
});

describe("enqueue", () => {
  it("adds one retrying job per row with a deterministic id", async () => {
    const { queue, calls } = fakeQueue();
    const n = await enqueueMessageEvents(queue, [
      { id: "a", attempts: 0 },
      { id: "b", attempts: 2 },
    ]);
    expect(n).toBe(2);
    expect(calls.map((c) => c.opts.jobId)).toEqual(["evt-a-0", "evt-b-2"]);
    expect(calls[0].data).toEqual({ eventId: "a" });
    expect((calls[0].opts as { attempts?: number }).attempts).toBe(MESSAGE_EVENT_JOB_ATTEMPTS);
  });
});

describe("sweep", () => {
  it("re-enqueues unprocessed rows inside the age window", async () => {
    const { queue, calls } = fakeQueue();
    const now = new Date("2026-11-04T12:00:00Z");
    const findMany = vi.fn(async (args: { where: { createdAt: { lt: Date; gt: Date } } }) => {
      // Window: older than 20s, younger than 24h.
      expect(args.where.createdAt.lt.getTime()).toBe(now.getTime() - 20_000);
      expect(args.where.createdAt.gt.getTime()).toBe(now.getTime() - 24 * 60 * 60 * 1000);
      return [{ id: "old", attempts: 5 }];
    });
    const result = await sweepMessageEvents(queue, { messageEvent: { findMany } }, { now });
    expect(result.rows).toBe(1);
    expect(calls[0].opts.jobId).toBe("evt-old-5");
  });

  it("keeps going when one enqueue fails", async () => {
    const calls: string[] = [];
    const queue: MessageEventQueueLike = {
      add: async (_n, data) => {
        const id = (data as { eventId: string }).eventId;
        if (id === "bad") throw new Error("redis down");
        calls.push(id);
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sweepMessageEvents(queue, {
      messageEvent: {
        findMany: async () => [
          { id: "bad", attempts: 0 },
          { id: "good", attempts: 0 },
        ],
      },
    });
    spy.mockRestore();
    expect(result.rows).toBe(1);
    expect(calls).toEqual(["good"]);
  });
});

describe("payload parsing", () => {
  const fanOut = {
    conversationId: "c1",
    projectId: null,
    taskId: null,
    userId: "u1",
    isClientRoom: false,
    participantIds: ["u1", "u2"],
    uniqueRecipients: ["u2"],
    notifyType: "message",
    title: "Ali · Direct message",
    notifBody: "hi",
    url: "/dashboard/messages/conv-c1",
    threadId: "conv-c1",
    authorName: "Ali",
    preview: "hi",
    notifIcon: undefined,
    messageCreatedAt: "2026-11-04T12:00:00.000Z",
  };

  it("accepts a well-formed message.new payload", () => {
    const parsed = parseMessageEventPayload({
      v: 1,
      publishes: [{ channels: ["conv:c1", ""], data: { type: "message.new" } }],
      fanOut,
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.publishes[0].channels).toEqual(["conv:c1"]);
    expect(parsed!.fanOut?.threadId).toBe("conv-c1");
    expect(parsed!.fanOut?.asBot).toBeUndefined();
  });

  it("accepts publish-only payloads (edit, delete, reaction)", () => {
    const parsed = parseMessageEventPayload({
      v: 1,
      publishes: [{ channels: ["project:p1"], data: { type: "message.deleted" } }],
    });
    expect(parsed?.fanOut).toBeUndefined();
    expect(parsed?.publishes).toHaveLength(1);
  });

  it("rejects payloads the worker cannot act on", () => {
    expect(parseMessageEventPayload(null)).toBeNull();
    expect(parseMessageEventPayload({ v: 2, publishes: [] })).toBeNull();
    expect(parseMessageEventPayload({ v: 1, publishes: "nope" })).toBeNull();
    expect(parseMessageEventPayload({ v: 1, publishes: [{ channels: "x" }] })).toBeNull();
    expect(
      parseMessageEventPayload({ v: 1, publishes: [], fanOut: { ...fanOut, userId: 1 } }),
    ).toBeNull();
    expect(
      parseMessageEventPayload({
        v: 1,
        publishes: [],
        fanOut: { ...fanOut, participantIds: "u1" },
      }),
    ).toBeNull();
  });
});
