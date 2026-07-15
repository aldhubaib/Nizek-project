// End-to-end banner behavior through the REAL service worker push path:
// display, focused-tab suppression, thread-tag replacement, and cross-device
// dismissal.
//
// Engine coverage: headless Firefox honors granted notification permission, so
// these run there on every test run. Headless Chromium/WebKit report
// Notification.permission as "denied" even when granted (headless has no
// notification UI) — for those, CI re-runs this suite headed under xvfb for
// Chromium; WebKit is covered by sw-registration.spec.ts + unit tests.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type ShownNotification = { title: string; body: string; tag: string | null };

async function grantOrSkip(context: BrowserContext) {
  try {
    await context.grantPermissions(["notifications"]);
  } catch {
    test.skip(true, "notifications permission not grantable in this engine");
  }
}

async function setup(page: Page) {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("sw-ready", {
    timeout: 15_000,
  });
  const effective = await page.evaluate(() => Notification.permission);
  test.skip(
    effective !== "granted",
    "notification permission not effective (headless engine without notification UI)",
  );
  await page.evaluate(() =>
    (window as unknown as { closeAllNotifications: () => Promise<void> })
      .closeAllNotifications(),
  );
}

const simulate = (page: Page, data: Record<string, unknown>, forceShow: boolean) =>
  page.evaluate(
    ([d, f]) =>
      (
        window as unknown as {
          simulatePush: (
            data: unknown,
            forceShow: boolean,
          ) => Promise<ShownNotification[]>;
        }
      ).simulatePush(d, f as boolean),
    [data, forceShow] as const,
  );

test("push shows an OS banner with the thread tag", async ({ page, context }) => {
  await grantOrSkip(context);
  await setup(page);

  const shown = await simulate(
    page,
    { title: "Ali", body: "hello", tag: "thread-conv-1", url: "/x" },
    true,
  );
  expect(shown).toEqual([
    { title: "Ali", body: "hello", tag: "thread-conv-1" },
  ]);
});

test("push is SUPPRESSED while the app tab is focused and visible", async ({
  page,
  context,
}) => {
  await grantOrSkip(context);
  await setup(page);
  await page.bringToFront();

  const focused = await page.evaluate(
    () => document.hasFocus() && document.visibilityState === "visible",
  );
  test.skip(!focused, "harness page not focused in this environment");

  const shown = await simulate(
    page,
    { title: "Ali", body: "hi", tag: "thread-conv-2" },
    false, // real path: SW checks its window clients
  );
  expect(shown).toEqual([]);
});

test("successive pushes for the same thread replace the banner (WhatsApp style)", async ({
  page,
  context,
}) => {
  await grantOrSkip(context);
  await setup(page);

  await simulate(page, { title: "Ali", body: "first", tag: "thread-conv-3" }, true);
  const shown = await simulate(
    page,
    { title: "Ali", body: "second", tag: "thread-conv-3" },
    true,
  );
  expect(shown).toEqual([
    { title: "Ali", body: "second", tag: "thread-conv-3" },
  ]);
});

test("reading elsewhere dismisses the banner by tag (cross-device dismissal)", async ({
  page,
  context,
}) => {
  await grantOrSkip(context);
  await setup(page);

  await simulate(page, { title: "A", body: "x", tag: "thread-conv-4" }, true);
  await simulate(page, { title: "B", body: "y", tag: "thread-conv-5" }, true);

  const remaining = await page.evaluate(() =>
    (
      window as unknown as { closeByTags: (tags: string[]) => Promise<number> }
    ).closeByTags(["thread-conv-4"]),
  );
  expect(remaining).toBe(1);
});

test("malformed push payloads never crash the worker or show garbage", async ({
  page,
  context,
}) => {
  await grantOrSkip(context);
  await setup(page);

  expect(await simulate(page, { body: "no title" }, true)).toEqual([]);
  expect(await simulate(page, {}, true)).toEqual([]);

  // Worker still functional afterwards.
  const shown = await simulate(page, { title: "Still alive" }, true);
  expect(shown).toEqual([{ title: "Still alive", body: "", tag: null }]);
});
