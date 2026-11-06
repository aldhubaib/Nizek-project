// Expo (mobile app) push: message shape, ticket/receipt classification and the
// effect each outcome must have on the stored token. Expo itself is a fake.

import { describe, expect, it } from "vitest";
import {
  buildBadgeMessage,
  buildExpoMessage,
  classifyExpoResult,
  isExpoPushTokenString,
  isValidDeviceId,
  type ExpoResult,
  type MobileTokenRow,
} from "@/lib/mobile-push-core";
import {
  applyExpoDeliveryEffects,
  deliverBadgeSync,
  deliverToExpoTokens,
  processExpoReceipts,
  type ExpoDeliveryDb,
} from "@/lib/push/expo-delivery";
import { PUSH_MAX_FAIL_COUNT, partitionByActiveThread } from "@/lib/push-core";

const PAYLOAD = {
  title: "Sara",
  body: "Can you check the brief?",
  url: "/dashboard/messages/conv-abc",
  tag: "thread-conv-abc",
  type: "message",
};

function token(id: string, memberId = "u1", failCount = 0): MobileTokenRow {
  return {
    id,
    memberId,
    token: `ExponentPushToken[${id.padEnd(22, "x")}]`,
    deviceId: `device-${id}`,
    platform: "ios",
    failCount,
  };
}

function fakeDb() {
  const calls = {
    logs: [] as unknown[],
    updateMany: [] as { where: unknown; data: unknown }[],
    deleteMany: [] as unknown[],
  };
  const db: ExpoDeliveryDb = {
    pushDeliveryLog: {
      createMany: async (args) => {
        calls.logs.push(...args.data);
      },
    },
    mobilePushToken: {
      updateMany: async (args) => {
        calls.updateMany.push(args);
      },
      deleteMany: async (args) => {
        calls.deleteMany.push(args.where.id.in);
      },
    },
  };
  return { db, calls };
}

describe("mobile push: validation", () => {
  it("accepts real Expo tokens and rejects junk", () => {
    expect(isExpoPushTokenString("ExponentPushToken[abcDEF123-_xyz]")).toBe(true);
    expect(isExpoPushTokenString("ExpoPushToken[abcDEF123xyz]")).toBe(true);
    expect(isExpoPushTokenString("ExponentPushToken[]")).toBe(false);
    expect(isExpoPushTokenString("https://web.push.apple.com/x")).toBe(false);
    expect(isExpoPushTokenString(42)).toBe(false);
  });

  it("bounds device ids", () => {
    expect(isValidDeviceId("5f1c2e0a-1b2c-4d3e-8f9a-0b1c2d3e4f5a")).toBe(true);
    expect(isValidDeviceId("short")).toBe(false);
    expect(isValidDeviceId("x".repeat(129))).toBe(false);
    expect(isValidDeviceId("has spaces here")).toBe(false);
  });
});

describe("mobile push: message shape", () => {
  it("carries the chat key so a tap opens the right thread, groups per chat, sets the badge", () => {
    const m = buildExpoMessage("ExponentPushToken[abcdefghijkl]", PAYLOAD, { badge: 3 });
    expect(m.to).toBe("ExponentPushToken[abcdefghijkl]");
    expect(m.title).toBe("Sara");
    expect(m.body).toBe("Can you check the brief?");
    expect(m.badge).toBe(3);
    expect(m.sound).toBe("default");
    expect(m.priority).toBe("high");
    expect(m.channelId).toBe("messages");
    expect(m.threadId).toBe("conv-abc");
    expect(m.data).toMatchObject({
      kind: "notification",
      threadId: "conv-abc",
      url: PAYLOAD.url,
      tag: PAYLOAD.tag,
      type: "message",
    });
  });

  it("omits the thread for non-chat notifications", () => {
    const m = buildExpoMessage("ExponentPushToken[abcdefghijkl]", {
      title: "Deadline",
      body: "Due tomorrow",
      url: "/dashboard/projects/p1",
      tag: "deadline-p1",
      type: "deadline",
    }, { badge: 0 });
    expect(m.threadId).toBeUndefined();
    expect(m.data?.threadId).toBeUndefined();
    expect(m.data?.url).toBe("/dashboard/projects/p1");
  });

  it("badge sync has no text and no sound", () => {
    const m = buildBadgeMessage("ExponentPushToken[abcdefghijkl]", 0);
    expect(m.title).toBeUndefined();
    expect(m.body).toBeUndefined();
    expect(m.sound).toBeNull();
    expect(m.badge).toBe(0);
    expect(m.data).toEqual({ kind: "badge" });
  });
});

describe("mobile push: classification", () => {
  const err = (code: string): ExpoResult => ({
    status: "error",
    message: code,
    details: { error: code },
  });
  it("maps Expo errors to the right action", () => {
    expect(classifyExpoResult({ status: "ok", id: "r1" })).toBe("ok");
    expect(classifyExpoResult(err("DeviceNotRegistered"))).toBe("gone");
    expect(classifyExpoResult(err("InvalidCredentials"))).toBe("permanent");
    expect(classifyExpoResult(err("MessageTooBig"))).toBe("permanent");
    expect(classifyExpoResult(err("DeveloperError"))).toBe("permanent");
    expect(classifyExpoResult(err("MessageRateExceeded"))).toBe("transient");
    expect(classifyExpoResult(err("ProviderError"))).toBe("transient");
    expect(classifyExpoResult(err("ExpoError"))).toBe("transient");
    expect(classifyExpoResult({ status: "error" })).toBe("transient");
    expect(classifyExpoResult(undefined)).toBe("transient");
  });
});

describe("mobile push: delivery effects", () => {
  it("sends one message per token with that person's badge and records tickets for receipts", async () => {
    const sent: unknown[][] = [];
    const effects = await deliverToExpoTokens({
      tokens: [token("a", "u1"), token("b", "u2")],
      payload: PAYLOAD,
      badgeByRecipient: new Map([["u1", 4]]),
      send: async (messages) => {
        sent.push(messages);
        return messages.map((_, i) => ({ status: "ok", id: `ticket-${i}` }));
      },
    });
    expect(sent).toHaveLength(1);
    expect((sent[0][0] as { badge: number }).badge).toBe(4);
    expect((sent[0][1] as { badge: number }).badge).toBe(0);
    expect(effects.counts).toEqual({ ok: 2, gone: 0, permanent: 0, transient: 0 });
    expect(effects.successIds).toEqual(["a", "b"]);
    expect(effects.receipts).toEqual([
      { receiptId: "ticket-0", tokenId: "a", memberId: "u1" },
      { receiptId: "ticket-1", tokenId: "b", memberId: "u2" },
    ]);
    expect(effects.logs.every((l) => l.ok && l.endpointHost === "exp.host")).toBe(true);
  });

  it("drops uninstalled devices, counts permanent failures, leaves transient ones alone", async () => {
    const effects = await deliverToExpoTokens({
      tokens: [token("gone"), token("bad"), token("busy"), token("retire", "u1", PUSH_MAX_FAIL_COUNT - 1)],
      payload: PAYLOAD,
      badgeByRecipient: new Map(),
      send: async () => [
        { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "x", details: { error: "InvalidCredentials" } },
        { status: "error", message: "x", details: { error: "MessageRateExceeded" } },
        { status: "error", message: "x", details: { error: "DeveloperError" } },
      ],
    });
    expect(effects.counts).toEqual({ ok: 0, gone: 1, permanent: 2, transient: 1 });
    expect(effects.goneIds).toEqual(["gone"]);
    expect(effects.permanentFailures.map((f) => f.id)).toEqual(["bad", "retire"]);

    const { db, calls } = fakeDb();
    await applyExpoDeliveryEffects(db, effects);
    // "gone" is deleted at once; "retire" crossed the fail limit and goes too.
    expect(calls.deleteMany.flat().sort()).toEqual(["gone", "retire"]);
    // "bad" gets a strike, "busy" is untouched.
    const incremented = calls.updateMany.filter(
      (c) => (c.data as { failCount?: unknown }).failCount !== undefined &&
        typeof (c.data as { failCount: unknown }).failCount === "object",
    );
    const struck = incremented.flatMap((c) => (c.where as { id: { in: string[] } }).id.in);
    expect(struck.sort()).toEqual(["bad", "retire"]);
    expect(struck).not.toContain("busy");
    expect(calls.logs).toHaveLength(4);
  });

  it("a failed HTTP call is transient for the whole chunk, after retries", async () => {
    let attempts = 0;
    const effects = await deliverToExpoTokens({
      tokens: [token("a"), token("b")],
      payload: PAYLOAD,
      badgeByRecipient: new Map(),
      send: async () => {
        attempts += 1;
        throw new Error("ECONNRESET");
      },
      retryBackoffMs: 1,
    });
    expect(attempts).toBe(3);
    expect(effects.counts.transient).toBe(2);
    expect(effects.goneIds).toEqual([]);
    expect(effects.permanentFailures).toEqual([]);
    expect(effects.logs.every((l) => !l.ok && l.error === "ECONNRESET")).toBe(true);
  });

  it("splits more than 100 tokens into several Expo requests", async () => {
    const tokens = Array.from({ length: 230 }, (_, i) => token(`t${i}`));
    const sizes: number[] = [];
    await deliverToExpoTokens({
      tokens,
      payload: PAYLOAD,
      badgeByRecipient: new Map(),
      send: async (messages) => {
        sizes.push(messages.length);
        return messages.map(() => ({ status: "ok" as const }));
      },
    });
    expect(sizes).toEqual([100, 100, 30]);
  });

  it("badge sync keeps only failure logs and schedules no receipts", async () => {
    const effects = await deliverBadgeSync({
      tokens: [token("a"), token("b")],
      badge: 2,
      send: async (messages) => {
        const all: ExpoResult[] = [
          { status: "ok", id: "r" },
          { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
        ];
        return all.slice(0, messages.length);
      },
    });
    expect(effects.receipts).toEqual([]);
    expect(effects.logs).toHaveLength(1);
    expect(effects.goneIds).toEqual(["b"]);
  });
});

describe("mobile push: receipts", () => {
  it("removes devices that APNs/FCM reported gone and strikes permanent errors", async () => {
    const { db, calls } = fakeDb();
    const summary = await processExpoReceipts({
      pending: [
        { receiptId: "r-ok", tokenId: "ok", memberId: "u1" },
        { receiptId: "r-gone", tokenId: "gone", memberId: "u1" },
        { receiptId: "r-perm", tokenId: "perm", memberId: "u2" },
        { receiptId: "r-missing", tokenId: "missing", memberId: "u2" },
      ],
      fetchReceipts: async () => ({
        "r-ok": { status: "ok" },
        "r-gone": { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
        "r-perm": { status: "error", message: "x", details: { error: "InvalidCredentials" } },
      }),
      db,
    });
    expect(summary).toEqual({ checked: 3, gone: 1, permanent: 1, transient: 0 });
    expect(calls.deleteMany.flat()).toEqual(["gone"]);
    const struck = calls.updateMany.flatMap((c) => (c.where as { id: { in: string[] } }).id.in);
    expect(struck).toEqual(["perm"]);
    expect(calls.logs).toHaveLength(2);
  });

  it("a receipts outage changes nothing", async () => {
    const { db, calls } = fakeDb();
    const summary = await processExpoReceipts({
      pending: [{ receiptId: "r1", tokenId: "a", memberId: "u1" }],
      fetchReceipts: async () => {
        throw new Error("503");
      },
      db,
    });
    expect(summary.checked).toBe(0);
    expect(calls.deleteMany).toEqual([]);
    expect(calls.updateMany).toEqual([]);
  });
});

describe("mobile push: active-thread suppression", () => {
  it("skips only the phone that is reading this chat", () => {
    const tokens = [token("reading", "u1"), token("pocket", "u1"), token("other", "u2")];
    const active = new Map<string, string | null>([
      ["u1:device-reading", "conv-abc"],
      ["u1:device-pocket", "conv-zzz"],
    ]);
    const { send, suppressed } = partitionByActiveThread(tokens, "conv-abc", active);
    expect(suppressed.map((t) => t.id)).toEqual(["reading"]);
    expect(send.map((t) => t.id)).toEqual(["pocket", "other"]);
  });
});
