// @vitest-environment jsdom
// The client runtime end to end (src/lib/push/store.ts) against a fake
// browser: registration, pushManager, Notification and fetch. These are the
// scenario tests for reinstall (S1), fresh install (S2) and update (S3) at the
// level where the iOS spinner bug actually lived.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY_BYTES = new Uint8Array(65);
for (let i = 0; i < KEY_BYTES.length; i++) KEY_BYTES[i] = (i * 7) % 251;
const VAPID_KEY = Buffer.from(KEY_BYTES).toString("base64url");
const OTHER_KEY = (() => {
  const b = KEY_BYTES.slice();
  b[0] ^= 1;
  return b;
})();

type FakeSub = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
};

function makeSub(endpoint: string, key: Uint8Array | null = KEY_BYTES): FakeSub {
  return {
    endpoint,
    options: { applicationServerKey: key ? (key.slice().buffer as ArrayBuffer) : null },
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

interface Browser {
  permission: NotificationPermission;
  requestPermissionResult: NotificationPermission;
  subscription: FakeSub | null;
  registered: Set<string>;
  registration: {
    active: { postMessage: ReturnType<typeof vi.fn> } | null;
    pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
    unregister: ReturnType<typeof vi.fn>;
  } | null;
  fetchCalls: { url: string; method: string; body: unknown }[];
  serverDown: boolean;
  subscribeFails: boolean;
}

let b: Browser;

function installBrowser(opts: Partial<Browser> & { hasRegistration?: boolean } = {}) {
  const hasReg = opts.hasRegistration !== false;
  b = {
    permission: "granted",
    requestPermissionResult: "granted",
    subscription: null,
    registered: new Set(),
    registration: null,
    fetchCalls: [],
    serverDown: false,
    subscribeFails: false,
    ...opts,
  };

  let counter = 0;
  const registration = {
    active: { postMessage: vi.fn() },
    pushManager: {
      getSubscription: vi.fn(async () => b.subscription),
      subscribe: vi.fn(async () => {
        if (b.subscribeFails) throw new Error("AbortError: push service refused");
        b.subscription = makeSub(`https://web.push.apple.com/new-${++counter}`);
        return b.subscription;
      }),
    },
    unregister: vi.fn(async () => true),
  };
  b.registration = hasReg ? registration : null;

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      get ready() {
        return b.registration ? Promise.resolve(b.registration) : new Promise(() => {});
      },
      getRegistration: vi.fn(async () => b.registration ?? undefined),
      getRegistrations: vi.fn(async () => (b.registration ? [b.registration] : [])),
      register: vi.fn(async () => {
        b.registration = registration;
        return registration;
      }),
    },
  });

  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      get permission() {
        return b.permission;
      },
      requestPermission: vi.fn(async () => {
        b.permission = b.requestPermissionResult;
        return b.permission;
      }),
    },
  });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      b.fetchCalls.push({ url, method, body });
      if (b.serverDown) throw new TypeError("Failed to fetch");
      if (url.startsWith("/api/push/status")) {
        const endpoint = new URL(url, "https://x").searchParams.get("endpoint");
        const registered = endpoint ? b.registered.has(endpoint) : false;
        return json({ registered, subscriptionId: registered ? "sub_1" : null, failCount: 0 });
      }
      if (url === "/api/push" && method === "POST") {
        if (body.oldEndpoint) b.registered.delete(body.oldEndpoint);
        b.registered.add(body.endpoint);
        return json({ ok: true, subscriptionId: "sub_1" });
      }
      if (url === "/api/push/device") return json({ ok: true });
      return json({}, 404);
    }),
  );
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function flush(ms = 0) {
  await new Promise((r) => setTimeout(r, ms));
}

async function loadStore() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VAPID_KEY);
  const store = await import("@/lib/push/store");
  const registration = await import("@/lib/push/registration");
  const telemetry = await import("@/lib/push/telemetry");
  store._resetPushStoreForTests();
  registration._resetRegistrationForTests();
  telemetry._resetTelemetryForTests();
  return store;
}

type SubscribeBody = { endpoint: string; oldEndpoint?: string; vapidKeyHash?: string };
function posts() {
  return b.fetchCalls.filter(
    (c): c is { url: string; method: string; body: SubscribeBody } =>
      c.url === "/api/push" && c.method === "POST",
  );
}
function statusGets() {
  return b.fetchCalls.filter((c) => c.url.startsWith("/api/push/status"));
}
function deviceReports() {
  return b.fetchCalls.filter((c) => c.url === "/api/push/device");
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
  });
  Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("S3 — update: existing granted + subscribed + registered device", () => {
  it("verifies with ONE status round-trip, no POST, and ends enabled", async () => {
    const sub = makeSub("https://web.push.apple.com/existing");
    installBrowser({ subscription: sub, registered: new Set([sub.endpoint]) });
    const store = await loadStore();

    await store.refreshPushStatus({ force: true });

    const snap = await snapshotOf(store);
    expect(snap.view).toBe("enabled");
    expect(snap.enabled).toBe(true);
    expect(statusGets()).toHaveLength(1);
    expect(posts()).toHaveLength(0);
    expect(deviceReports().length).toBeGreaterThanOrEqual(1);
    expect(deviceReports().at(-1)!.body).toMatchObject({ enabled: true, permission: "granted", platform: "ios", standalone: true });
  });

  it("uses the cache on the next foreground when the endpoint is unchanged (zero network)", async () => {
    const sub = makeSub("https://web.push.apple.com/existing");
    installBrowser({ subscription: sub, registered: new Set([sub.endpoint]) });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });
    expect(statusGets()).toHaveLength(1);

    // Bypass the 3s throttle by advancing the clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10_000);
    await store.refreshPushStatus();
    vi.useRealTimers();
    expect(statusGets()).toHaveLength(1);
    expect((await snapshotOf(store)).view).toBe("enabled");
  });

  it("re-registers when iOS rotated the endpoint (browser sub not on server) — one POST, then enabled", async () => {
    const sub = makeSub("https://web.push.apple.com/rotated");
    installBrowser({ subscription: sub, registered: new Set(["https://web.push.apple.com/old"]) });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    expect(posts()).toHaveLength(1);
    expect(posts()[0].body.endpoint).toBe(sub.endpoint);
    expect((await snapshotOf(store)).view).toBe("enabled");
  });

  it("replaces a subscription made under a rotated VAPID key and tells the server the old endpoint", async () => {
    const stale = makeSub("https://web.push.apple.com/stale-key", OTHER_KEY);
    installBrowser({ subscription: stale, registered: new Set([stale.endpoint]) });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    // Server said registered, so the check alone reports enabled... but the
    // key mismatch is caught on the next enable/heal. Force one:
    await store.enablePushFromGesture();
    expect(stale.unsubscribe).toHaveBeenCalled();
    const post = posts().at(-1)!;
    expect(post.body.oldEndpoint).toBe(stale.endpoint);
    expect(post.body.endpoint).toMatch(/new-1$/);
    expect(post.body.vapidKeyHash).toMatch(/^[0-9a-f]{8}$/);
    expect((await snapshotOf(store)).view).toBe("enabled");
  });
});

describe("S2 — fresh install", () => {
  it("granted with no subscription: repairs once automatically and ends enabled", async () => {
    installBrowser({ subscription: null });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    expect(b.registration!.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(1);
    expect((await snapshotOf(store)).view).toBe("enabled");
  });

  it("permission default on iOS standalone: pre-prompt, no network, no pushManager access", async () => {
    installBrowser({ permission: "default" });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    const snap = await snapshotOf(store);
    expect(snap.view).toBe("pre-prompt");
    expect(statusGets()).toHaveLength(0);
    expect(b.registration!.pushManager.getSubscription).not.toHaveBeenCalled();
  });

  it("Continue → Allow: requestPermission is the first await, then subscribe + POST → enabled", async () => {
    installBrowser({ permission: "default", requestPermissionResult: "granted" });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    const outcome = await store.enablePushFromGesture({ confirmWithBanner: true });
    expect(outcome.result).toEqual({ ok: true, endpoint: expect.stringMatching(/new-1$/) });
    expect(outcome.bannerShown).toBe(true);
    expect((await snapshotOf(store)).view).toBe("enabled");
    // The permission request happened before any serviceWorker/pushManager work.
    const requestOrder = (window.Notification.requestPermission as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const subscribeOrder = b.registration!.pushManager.subscribe.mock.invocationCallOrder[0];
    expect(requestOrder).toBeLessThan(subscribeOrder);
  });

  it("Continue → Don't Allow: denied view with two recovery paths, nothing subscribed", async () => {
    installBrowser({ permission: "default", requestPermissionResult: "denied" });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    const outcome = await store.enablePushFromGesture();
    expect(outcome.result).toEqual({ ok: false, reason: "permission-denied" });
    expect((await snapshotOf(store)).view).toBe("denied");
    expect(b.registration!.pushManager.subscribe).not.toHaveBeenCalled();
    expect(deviceReports().at(-1)!.body).toMatchObject({ permission: "denied", enabled: false });
  });

  it("granted but subscribe() keeps failing: ONE repair, repair-failed with the reason, no loop", async () => {
    installBrowser({ subscription: null, subscribeFails: true });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    let snap = await snapshotOf(store);
    expect(snap.view).toBe("repair-failed");
    expect(snap.lastFailure?.reason).toBe("subscribe-failed");
    expect(snap.repairing).toBe(false);
    expect(snap.checking).toBe(false);

    // Subsequent foregrounds within the cooldown do NOT retry the repair.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10_000);
    await store.refreshPushStatus({ force: true });
    vi.useRealTimers();
    expect(b.registration!.pushManager.subscribe).toHaveBeenCalledTimes(1);
    snap = await snapshotOf(store);
    expect(snap.view).toBe("repair-failed");
    expect(deviceReports().at(-1)!.body).toMatchObject({ lastReason: "subscribe-failed" });
  });

  it("no service worker can activate: repair-failed(no-service-worker), never hangs", async () => {
    installBrowser({ hasRegistration: false });
    // register() must NOT produce a registration here either.
    (navigator.serviceWorker.register as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new Error("SecurityError");
    });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });

    const snap = await snapshotOf(store);
    expect(snap.view).toBe("repair-failed");
    expect(snap.lastFailure?.reason).toBe("no-service-worker");
    expect(snap.checking).toBe(false);
  });
});

describe("S1 — installed, removed, reinstalled", () => {
  it("fresh install after removal starts at pre-prompt even though the server still holds the old row", async () => {
    installBrowser({ permission: "default", registered: new Set(["https://web.push.apple.com/old-install"]) });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });
    expect((await snapshotOf(store)).view).toBe("pre-prompt");
  });

  it("reinstall + Allow registers the NEW endpoint (old row is retired by the worker on 410, not here)", async () => {
    installBrowser({ permission: "default", registered: new Set(["https://web.push.apple.com/old-install"]) });
    const store = await loadStore();
    await store.enablePushFromGesture();
    expect(posts()[0].body.endpoint).toMatch(/new-1$/);
    expect(posts()[0].body.oldEndpoint).toBeUndefined();
    expect((await snapshotOf(store)).view).toBe("enabled");
  });

  it("denied → user follows the Settings path → 'check again' re-reads permission and heals", async () => {
    installBrowser({ permission: "denied" });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });
    expect((await snapshotOf(store)).view).toBe("denied");

    // User toggled Settings and force-quit; iOS now reports granted.
    b.permission = "granted";
    await store.refreshPushStatus({ force: true });
    expect((await snapshotOf(store)).view).toBe("enabled");
    expect(posts()).toHaveLength(1);
  });
});

describe("resilience", () => {
  it("server unreachable during a check keeps the previous verdict and clears checking", async () => {
    const sub = makeSub("https://web.push.apple.com/existing");
    installBrowser({ subscription: sub, registered: new Set([sub.endpoint]) });
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });
    expect((await snapshotOf(store)).view).toBe("enabled");

    b.serverDown = true;
    await store.refreshPushStatus({ force: true });
    const snap = await snapshotOf(store);
    expect(snap.view).toBe("enabled");
    expect(snap.checking).toBe(false);
  });

  it("concurrent refreshes share one check (one status GET)", async () => {
    const sub = makeSub("https://web.push.apple.com/existing");
    installBrowser({ subscription: sub, registered: new Set([sub.endpoint]) });
    const store = await loadStore();
    await Promise.all([
      store.refreshPushStatus({ force: true }),
      store.refreshPushStatus(),
      store.refreshPushStatus(),
    ]);
    expect(statusGets()).toHaveLength(1);
  });

  it("does not gate an iOS browser tab's button into a dead end: view is install and no pushManager access", async () => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
    installBrowser({ permission: "default" });
    Object.defineProperty(window, "PushManager", { configurable: true, value: undefined });
    delete (window as { PushManager?: unknown }).PushManager;
    const store = await loadStore();
    await store.refreshPushStatus({ force: true });
    expect((await snapshotOf(store)).view).toBe("install");
    expect(statusGets()).toHaveLength(0);
  });
});

// Read the store's current snapshot without React.
async function snapshotOf(store: typeof import("@/lib/push/store")) {
  await flush();
  return store.getPushSnapshot();
}
