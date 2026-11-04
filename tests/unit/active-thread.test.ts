// Server-side "don't buzz the device that is already reading this thread"
// decision. This replaced the service worker's focused-tab suppression, which
// cost iOS installs their push permission (a push that shows nothing counts as
// silent). A regression here either double-notifies or, worse, drops pushes.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_THREAD_HEARTBEAT_MS,
  ACTIVE_THREAD_TTL_SECONDS,
  activeThreadRedisKey,
  isValidThreadKey,
  partitionByActiveThread,
  threadKeyFromPushTag,
} from "@/lib/push-core";

const subs = [
  { id: "a", memberId: "u1", deviceId: "phone" },
  { id: "b", memberId: "u1", deviceId: "laptop" },
  { id: "c", memberId: "u1", deviceId: null },
  { id: "d", memberId: "u2", deviceId: "phone" },
];

describe("threadKeyFromPushTag", () => {
  it("strips the thread prefix", () => {
    expect(threadKeyFromPushTag("thread-conv-1")).toBe("conv-1");
    expect(threadKeyFromPushTag("thread-task-9")).toBe("task-9");
  });
  it("returns null for non-thread tags and junk", () => {
    expect(threadKeyFromPushTag("push-setup-confirmation")).toBeNull();
    expect(threadKeyFromPushTag("thread-")).toBeNull();
    expect(threadKeyFromPushTag(undefined)).toBeNull();
    expect(threadKeyFromPushTag(null)).toBeNull();
  });
});

describe("isValidThreadKey", () => {
  it("accepts the three thread kinds the client sends", () => {
    expect(isValidThreadKey("conv-cm123")).toBe(true);
    expect(isValidThreadKey("project-cm123")).toBe(true);
    expect(isValidThreadKey("task-cm_1-2")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidThreadKey("user-1")).toBe(false);
    expect(isValidThreadKey("conv-")).toBe(false);
    expect(isValidThreadKey("conv-a b")).toBe(false);
    expect(isValidThreadKey(42)).toBe(false);
    expect(isValidThreadKey(null)).toBe(false);
  });
});

describe("partitionByActiveThread", () => {
  it("skips only the device whose heartbeat names this thread", () => {
    const active = new Map<string, string | null>([
      ["u1:phone", "conv-1"],
      ["u1:laptop", "conv-2"],
      ["u2:phone", null],
    ]);
    const { send, suppressed } = partitionByActiveThread(subs, "conv-1", active);
    expect(suppressed.map((s) => s.id)).toEqual(["a"]);
    expect(send.map((s) => s.id)).toEqual(["b", "c", "d"]);
  });

  it("sends to every device when the push is not about a thread", () => {
    const active = new Map<string, string | null>([["u1:phone", "conv-1"]]);
    const { send, suppressed } = partitionByActiveThread(subs, null, active);
    expect(send).toHaveLength(4);
    expect(suppressed).toHaveLength(0);
  });

  it("sends to every device when no heartbeat is known (Redis down / stale)", () => {
    const { send, suppressed } = partitionByActiveThread(subs, "conv-1", new Map());
    expect(send).toHaveLength(4);
    expect(suppressed).toHaveLength(0);
  });

  it("never suppresses a subscription without a device id", () => {
    const active = new Map<string, string | null>([["u1:null", "conv-1"]]);
    const { send } = partitionByActiveThread(subs, "conv-1", active);
    expect(send.some((s) => s.id === "c")).toBe(true);
  });
});

describe("heartbeat timing", () => {
  it("keeps the key alive across at least two missed beats", () => {
    expect(ACTIVE_THREAD_TTL_SECONDS * 1000).toBeGreaterThan(ACTIVE_THREAD_HEARTBEAT_MS * 2);
  });
  it("keys are scoped per user and device", () => {
    expect(activeThreadRedisKey("u1", "d1")).toBe("active:u1:d1");
  });
});
