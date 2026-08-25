// Cross-browser (chromium + firefox + webkit): the production service worker
// registers cleanly and its decision library behaves identically in every
// engine employees actually use.

import { expect, test } from "@playwright/test";

test("production sw.js registers successfully", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("sw-ready", {
    timeout: 15_000,
  });
});

test("sw-lib decision logic behaves identically in this engine", async ({
  page,
}) => {
  await page.goto("/");

  const results = await page.evaluate(async () => {
    type SwLib = {
      parsePushPayload: (raw: string) => unknown;
      shouldShowPushNotification: (clients: unknown) => boolean;
      notificationOptionsFor: (data: unknown) => Record<string, unknown>;
    };
    // Load the real shipped file into the page context.
    const src = await (await fetch("/sw-lib.js")).text();
    (0, eval)(src);
    const lib = (window as unknown as { NizekSwLib: SwLib }).NizekSwLib;

    return {
      parsedOk: lib.parsePushPayload(
        JSON.stringify({ title: "T", tag: "thread-conv-1" }),
      ),
      parsedGarbage: lib.parsePushPayload("{{nope"),
      showWhenClosed: lib.shouldShowPushNotification([]),
      showWhenHidden: lib.shouldShowPushNotification([
        { focused: false, visibilityState: "hidden" },
      ]),
      suppressWhenFocused: lib.shouldShowPushNotification([
        { focused: true, visibilityState: "visible" },
      ]),
      options: lib.notificationOptionsFor({ body: "b", tag: "t1" }),
    };
  });

  expect(results.parsedOk).toMatchObject({ title: "T", tag: "thread-conv-1" });
  expect(results.parsedGarbage).toBeNull();
  expect(results.showWhenClosed).toBe(true);
  expect(results.showWhenHidden).toBe(true);
  expect(results.suppressWhenFocused).toBe(false);
  expect(results.options).toMatchObject({
    tag: "t1",
    renotify: true,
    silent: false,
  });
});

test("sw-lib cache classification stays conservative", async ({ page }) => {
  await page.goto("/");

  const results = await page.evaluate(async () => {
    type SwLib = {
      classifyRequest: (
        req: {
          method?: string;
          url: string;
          cache?: string;
          mode?: string;
          headers?: Record<string, string>;
        },
        origin: string,
      ) => string | null;
    };
    const src = await (await fetch("/sw-lib.js")).text();
    (0, eval)(src);
    const lib = (window as unknown as { NizekSwLib: SwLib }).NizekSwLib;
    const origin = location.origin;
    return {
      staticAsset: lib.classifyRequest(
        { url: `${origin}/_next/static/chunks/a.js` },
        origin,
      ),
      dashboardNav: lib.classifyRequest(
        {
          url: `${origin}/dashboard`,
          mode: "navigate",
          headers: { "Sec-Fetch-Dest": "document" },
        },
        origin,
      ),
      apiVersion: lib.classifyRequest({ url: `${origin}/api/version` }, origin),
      serverAction: lib.classifyRequest(
        { url: `${origin}/dashboard`, headers: { "Next-Action": "1" } },
        origin,
      ),
      post: lib.classifyRequest(
        { method: "POST", url: `${origin}/dashboard` },
        origin,
      ),
      sound: lib.classifyRequest(
        { url: `${origin}/files/notification_sound/x.mp3` },
        origin,
      ),
    };
  });

  expect(results.staticAsset).toBe("static");
  expect(results.dashboardNav).toBe("navigation");
  expect(results.apiVersion).toBeNull();
  expect(results.serverAction).toBeNull();
  expect(results.post).toBeNull();
  expect(results.sound).toBe("sound");
});
