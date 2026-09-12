// Server-side push delivery policy: payload shape, retry classification, and
// the retry loop itself.

import { describe, expect, it, vi } from "vitest";
import {
  assessPushQueue,
  buildPushBody,
  endpointHost,
  isGoneStatus,
  isRetryableStatus,
  sendWithRetry,
  PUSH_TTL_SECONDS,
} from "@/lib/push-core";

describe("buildPushBody", () => {
  it("serializes the full payload", () => {
    const body = JSON.parse(
      buildPushBody(
        {
          title: "Ali",
          body: "hello",
          url: "/dashboard/messages/conv-1",
          tag: "thread-conv-1",
          icon: "/a.png",
        },
        { badge: 4, fallbackUrl: "/dashboard" },
      ),
    );
    expect(body).toEqual({
      title: "Ali",
      body: "hello",
      url: "/dashboard/messages/conv-1",
      badge: 4,
      tag: "thread-conv-1",
      icon: "/a.png",
    });
  });

  it("falls back to the app URL when the payload has none", () => {
    const body = JSON.parse(
      buildPushBody({ title: "T" }, { badge: 0, fallbackUrl: "/dashboard" }),
    );
    expect(body.url).toBe("/dashboard");
    expect(body.body).toBe("");
  });

  it("uses a 24h TTL", () => {
    expect(PUSH_TTL_SECONDS).toBe(86_400);
  });
});

describe("retry classification", () => {
  it("retries network errors, 429 and 5xx", () => {
    expect(isRetryableStatus(undefined)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("does not retry permanent failures", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(410)).toBe(false);
  });

  it("recognizes gone subscriptions", () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(500)).toBe(false);
    expect(isGoneStatus(undefined)).toBe(false);
  });
});

describe("endpointHost", () => {
  it("extracts the push service host", () => {
    expect(endpointHost("https://fcm.googleapis.com/fcm/send/abc")).toBe(
      "fcm.googleapis.com",
    );
  });
  it("returns null on garbage", () => {
    expect(endpointHost("not a url")).toBeNull();
  });
});

describe("sendWithRetry", () => {
  const pushError = (statusCode: number) =>
    Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

  it("succeeds on first attempt", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await sendWithRetry(send, { backoffMs: 1 });
    expect(res).toEqual({ ok: true, attempts: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries once on a transient failure and can recover", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(pushError(503))
      .mockResolvedValueOnce(undefined);
    const res = await sendWithRetry(send, { backoffMs: 1 });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry permanent failures (410 gone)", async () => {
    const send = vi.fn().mockRejectedValue(pushError(410));
    const res = await sendWithRetry(send, { backoffMs: 1 });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(410);
    expect(res.attempts).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gives up after the third transient failure", async () => {
    const send = vi.fn().mockRejectedValue(pushError(429));
    const res = await sendWithRetry(send, { backoffMs: 1 });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.attempts).toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("captures network errors without a status code", async () => {
    const send = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const res = await sendWithRetry(send, { backoffMs: 1 });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBeUndefined();
    expect(res.error).toBe("socket hang up");
    expect(res.attempts).toBe(3);
  });

  it("never throws", async () => {
    const send = vi.fn().mockRejectedValue("weird non-error rejection");
    await expect(sendWithRetry(send, { backoffMs: 1 })).resolves.toMatchObject({
      ok: false,
    });
  });
});

// Every real notification is enqueued rather than sent inline, so a stopped
// worker delivers nothing while every per-device check still passes. This is
// the blind spot that made "I turned it on and got nothing" undiagnosable.
describe("assessPushQueue", () => {
  const NOW = new Date("2026-09-12T12:00:00Z");
  const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

  it("passes an idle queue that has delivered before", () => {
    expect(
      assessPushQueue({
        reachable: true,
        waiting: 0,
        active: 0,
        lastCompletedAt: secondsAgo(30),
        now: NOW,
      }),
    ).toMatchObject({ state: "ok" });
  });

  it("passes a brand new queue that has nothing to do yet", () => {
    expect(
      assessPushQueue({
        reachable: true,
        waiting: 0,
        active: 0,
        lastCompletedAt: null,
        now: NOW,
      }),
    ).toMatchObject({ state: "ok" });
  });

  it("fails when the queue cannot be reached", () => {
    const result = assessPushQueue({
      reachable: false,
      waiting: 0,
      active: 0,
      lastCompletedAt: null,
      now: NOW,
    });
    expect(result.state).toBe("fail");
    expect(result.detail).toMatch(/can't be reached/i);
  });

  it("fails when jobs are queued but nothing has ever been delivered", () => {
    const result = assessPushQueue({
      reachable: true,
      waiting: 3,
      active: 0,
      lastCompletedAt: null,
      now: NOW,
    });
    expect(result.state).toBe("fail");
    expect(result.label).toMatch(/not running/i);
  });

  it("fails when jobs are queued and the last delivery is stale", () => {
    expect(
      assessPushQueue({
        reachable: true,
        waiting: 2,
        active: 0,
        lastCompletedAt: secondsAgo(10 * 60),
        now: NOW,
      }),
    ).toMatchObject({ state: "fail" });
  });

  it("tolerates a queue that is actively being drained", () => {
    expect(
      assessPushQueue({
        reachable: true,
        waiting: 2,
        active: 1,
        lastCompletedAt: secondsAgo(10),
        now: NOW,
      }),
    ).toMatchObject({ state: "ok" });
  });

  it("warns about a deep backlog even while the worker keeps up", () => {
    const result = assessPushQueue({
      reachable: true,
      waiting: 40,
      active: 1,
      lastCompletedAt: secondsAgo(5),
      now: NOW,
    });
    expect(result.state).toBe("warn");
    expect(result.detail).toContain("40");
  });

  it("counts a single queued notification in singular", () => {
    const result = assessPushQueue({
      reachable: true,
      waiting: 1,
      active: 0,
      lastCompletedAt: null,
      now: NOW,
    });
    expect(result.detail).toContain("1 notification ");
  });
});
