// The service worker's decision logic (public/sw-lib.js) — the code that
// decides whether an OS banner is shown for a push. A regression here is
// exactly the "employees don't get the notification sound" bug.

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const swLib = require("../../public/sw-lib.js") as {
  parsePushPayload: (raw: string | null | undefined) => {
    title: string;
    body: string;
    url: string;
    badge: number | null;
    tag: string | null;
    icon: string | null;
  } | null;
  shouldShowPushNotification: (
    clients: { focused?: boolean; visibilityState?: string }[] | null,
  ) => boolean;
  notificationOptionsFor: (data: Record<string, unknown>) => Record<string, unknown>;
};

describe("parsePushPayload", () => {
  it("parses a full payload", () => {
    const raw = JSON.stringify({
      title: "Ali",
      body: "hello",
      url: "/dashboard/messages/conv-1",
      badge: 3,
      tag: "thread-conv-1",
      icon: "/avatar.png",
    });
    expect(swLib.parsePushPayload(raw)).toEqual({
      title: "Ali",
      body: "hello",
      url: "/dashboard/messages/conv-1",
      badge: 3,
      tag: "thread-conv-1",
      icon: "/avatar.png",
    });
  });

  it("defaults missing fields", () => {
    const parsed = swLib.parsePushPayload(JSON.stringify({ title: "T" }));
    expect(parsed).toEqual({
      title: "T",
      body: "",
      url: "/dashboard",
      badge: null,
      tag: null,
      icon: null,
    });
  });

  it("rejects garbage", () => {
    expect(swLib.parsePushPayload("not json")).toBeNull();
    expect(swLib.parsePushPayload("")).toBeNull();
    expect(swLib.parsePushPayload(null)).toBeNull();
    expect(swLib.parsePushPayload(JSON.stringify({ body: "no title" }))).toBeNull();
    expect(swLib.parsePushPayload(JSON.stringify(null))).toBeNull();
    expect(swLib.parsePushPayload(JSON.stringify("string"))).toBeNull();
  });
});

describe("shouldShowPushNotification (WhatsApp behavior)", () => {
  it("shows when there are no clients (app closed)", () => {
    expect(swLib.shouldShowPushNotification([])).toBe(true);
  });

  it("shows when a tab exists but is hidden (backgrounded/minimized)", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: false, visibilityState: "hidden" },
      ]),
    ).toBe(true);
  });

  it("shows when a tab is visible but NOT focused (app behind another window)", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: false, visibilityState: "visible" },
      ]),
    ).toBe(true);
  });

  it("suppresses ONLY when a tab is focused and visible (user is looking)", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: true, visibilityState: "visible" },
      ]),
    ).toBe(false);
  });

  it("suppresses when any of several tabs is focused-visible", () => {
    expect(
      swLib.shouldShowPushNotification([
        { focused: false, visibilityState: "hidden" },
        { focused: true, visibilityState: "visible" },
      ]),
    ).toBe(false);
  });

  it("shows on malformed input (fail open — never lose a notification)", () => {
    expect(swLib.shouldShowPushNotification(null)).toBe(true);
  });
});

describe("notificationOptionsFor", () => {
  it("builds options with tag-based renotify and audible banner", () => {
    const opts = swLib.notificationOptionsFor({
      body: "hi",
      url: "/x",
      tag: "thread-conv-1",
    });
    expect(opts.tag).toBe("thread-conv-1");
    expect(opts.renotify).toBe(true);
    expect(opts.silent).toBe(false);
    expect((opts.data as { url: string }).url).toBe("/x");
  });

  it("omits renotify without a tag", () => {
    const opts = swLib.notificationOptionsFor({ body: "hi" });
    expect(opts.tag).toBeUndefined();
    expect(opts.renotify).toBe(false);
  });
});
