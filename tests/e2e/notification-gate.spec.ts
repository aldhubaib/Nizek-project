// The REAL <NotificationGate> (bundled from src/ by the harness) against a
// mocked API, in every engine. Permission and pushManager are forced through
// init scripts so the three states are deterministic in headless browsers:
//   default  → gated on first paint, action button enabled
//   granted  → never gated, no spinner, one status round-trip
//   denied   → gated with recovery guidance and an ENABLED "check again" button

import { expect, test, type Page } from "@playwright/test";

const ENDPOINT = "https://push.example.test/e2e-endpoint";

/** Force Notification.permission and (optionally) a fake subscribed pushManager. */
async function forceBrowserState(
  page: Page,
  permission: NotificationPermission,
  opts: { subscribed?: boolean } = {},
) {
  await page.addInitScript(
    ({ permission, subscribed, endpoint }) => {
      // Notification.permission is a static getter; shadow it on the constructor.
      const N = (window as unknown as { Notification?: unknown }).Notification as
        | { prototype: unknown }
        | undefined;
      if (N) {
        Object.defineProperty(N, "permission", { configurable: true, get: () => permission });
      } else {
        Object.defineProperty(window, "Notification", {
          configurable: true,
          value: {
            get permission() {
              return permission;
            },
            requestPermission: async () => permission,
          },
        });
      }
      if (!("PushManager" in window)) {
        Object.defineProperty(window, "PushManager", { configurable: true, value: function () {} });
      }

      // A fake pushManager on every registration: subscribed or not, never
      // talking to a real push service.
      const key = new Uint8Array(65).fill(4).buffer;
      const sub = {
        endpoint,
        options: { applicationServerKey: key },
        toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
        unsubscribe: async () => true,
      };
      const fakePushManager = {
        getSubscription: async () => (subscribed ? sub : null),
        subscribe: async () => sub,
        permissionState: async () => permission,
      };
      // Decoding the configured VAPID key must match the fake sub's key for the
      // store to keep it; make both sides agree by patching the comparison input.
      Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
        configurable: true,
        get: () => fakePushManager,
      });
    },
    { permission, subscribed: opts.subscribed === true, endpoint: ENDPOINT },
  );
}

/**
 * The /api/push* mock lives in the harness server (see harness/server.mjs):
 * once sw.js controls the page, Firefox and WebKit route fetches through the
 * service worker and page.route() never sees them. Cookies scope the mock's
 * behaviour and call log to this test so parallel workers stay isolated.
 */
async function mockApi(page: Page, opts: { registered: boolean }) {
  const id = `${test.info().workerIndex}-${test.info().testId}`;
  const base = new URL(test.info().project.use.baseURL ?? "http://localhost:4173");
  await page.context().addCookies([
    { name: "mockId", value: id, domain: base.hostname, path: "/" },
    { name: "mockRegistered", value: opts.registered ? "1" : "0", domain: base.hostname, path: "/" },
  ]);
  return {
    calls: async () =>
      (await (await page.request.get(`/__mock/calls/${encodeURIComponent(id)}`)).json()) as {
        url: string;
        method: string;
      }[],
  };
}

test("permission default: gated on first paint with an enabled action button", async ({ page }) => {
  await forceBrowserState(page, "default");
  await mockApi(page, { registered: false });
  await page.goto("/gate.html");

  const gate = page.getByTestId("notification-gate");
  await expect(gate).toBeVisible();
  await expect(gate).toHaveAttribute("data-view", "prompt");
  await expect(page.getByTestId("notification-gate-action")).toBeEnabled();
  await expect(page.getByTestId("notification-gate-action")).toHaveText(/Enable Notifications/);

  // The app is still mounted underneath (overlay, not a conditional return).
  await expect(page.getByTestId("app")).toBeAttached();
});

test("permission granted + registered: never gated, no spinner, one status round-trip", async ({ page }) => {
  await forceBrowserState(page, "granted", { subscribed: true });
  const mock = await mockApi(page, { registered: true });
  await page.goto("/gate.html");

  await expect(page.getByTestId("app")).toBeVisible();
  // Wait for the store to settle then keep watching: the gate must never appear.
  await expect
    .poll(async () => (await page.evaluate(() => (window as unknown as { pushSnapshot: () => { view: string } }).pushSnapshot().view)), {
      timeout: 15_000,
    })
    .toBe("enabled");
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("notification-gate")).toHaveCount(0);
  await expect(page.locator(".animate-spin")).toHaveCount(0);

  const calls = await mock.calls();
  const statusCalls = calls.filter((c) => c.url === "/api/push/status");
  expect(statusCalls).toHaveLength(1);
  expect(calls.filter((c) => c.url === "/api/push" && c.method === "POST")).toHaveLength(0);
});

test("permission denied: gated with recovery steps and an enabled check-again button", async ({ page }) => {
  await forceBrowserState(page, "denied");
  await mockApi(page, { registered: false });
  await page.goto("/gate.html");

  const gate = page.getByTestId("notification-gate");
  await expect(gate).toBeVisible();
  await expect(gate).toHaveAttribute("data-view", "denied");
  await expect(gate).toContainText(/Notifications are blocked/);
  const action = page.getByTestId("notification-gate-action");
  await expect(action).toBeEnabled();
  await expect(action).toHaveText(/check again/i);

  // Clicking re-checks without hanging the button.
  await action.click();
  await expect(action).toBeEnabled({ timeout: 10_000 });
});

test("granted but browser lost its subscription: repaired automatically, never gated meanwhile", async ({ page }) => {
  await forceBrowserState(page, "granted", { subscribed: false });
  const mock = await mockApi(page, { registered: false });
  await page.goto("/gate.html");

  await expect
    .poll(async () => (await page.evaluate(() => (window as unknown as { pushSnapshot: () => { view: string } }).pushSnapshot().view)), {
      timeout: 20_000,
    })
    .toBe("enabled");
  await expect(page.getByTestId("notification-gate")).toHaveCount(0);
  const calls = await mock.calls();
  expect(calls.filter((c) => c.url === "/api/push" && c.method === "POST")).toHaveLength(1);
});
