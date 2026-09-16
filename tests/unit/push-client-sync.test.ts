// @vitest-environment jsdom
// The browser side of the enable handshake: what the toggle actually does when
// the server rejects the subscription, when the VAPID key has rotated, and when
// no service worker ever activates.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const KEY_BYTES = new Uint8Array(65);
for (let i = 0; i < KEY_BYTES.length; i++) KEY_BYTES[i] = (i * 7) % 251;
const VAPID_KEY = Buffer.from(KEY_BYTES).toString("base64url");

const ENDPOINT = "https://push.example.test/sub/abc";

type FakeSubscription = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: () => Promise<boolean>;
};

function makeSubscription(key: Uint8Array | null): FakeSubscription {
  return {
    endpoint: ENDPOINT,
    options: {
      applicationServerKey: key
        ? (key.slice().buffer as ArrayBuffer)
        : null,
    },
    toJSON: () => ({
      endpoint: ENDPOINT,
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    }),
    unsubscribe: vi.fn(async () => true),
  };
}

let existingSubscription: FakeSubscription | null;
let subscribeMock: ReturnType<typeof vi.fn>;
let readyPromise: Promise<unknown>;
let registeredWorkerUrl: string | null;

function installServiceWorkerMock() {
  const registration = {
    active: { postMessage: vi.fn() },
    pushManager: {
      getSubscription: vi.fn(async () => existingSubscription),
      subscribe: subscribeMock,
    },
  };
  readyPromise = Promise.resolve(registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      get ready() {
        return readyPromise;
      },
      getRegistration: vi.fn(async () => registration),
      register: vi.fn(async (url: string) => {
        registeredWorkerUrl = url;
        return registration;
      }),
    },
  });
  return registration;
}

function setPermission(permission: NotificationPermission) {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    writable: true,
    value: Object.assign(
      function Notification() {},
      { permission, requestPermission: vi.fn(async () => permission) },
    ),
  });
}

/** Reimports the module so module-scope env reads pick up the stubs. */
async function freshModule() {
  vi.resetModules();
  return import("@/lib/push-client");
}

beforeAll(() => {
  // Node's experimental localStorage global shadows jsdom's and lacks the full
  // Storage API, which getDeviceId() needs.
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  window.matchMedia ??= (() => ({ matches: false })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", VAPID_KEY);
  // resolveRegistration deliberately refuses to register outside production,
  // because a controlling SW serves stale dev chunks.
  vi.stubEnv("NODE_ENV", "production");
  existingSubscription = null;
  registeredWorkerUrl = null;
  subscribeMock = vi.fn(async () => makeSubscription(KEY_BYTES));
  setPermission("granted");
  installServiceWorkerMock();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body: unknown },
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const { status, body } = handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("syncPushSubscription", () => {
  it("succeeds when the server confirms the stored row", async () => {
    mockFetch(() => ({ status: 200, body: { ok: true, subscriptionId: "sub_1" } }));
    const lib = await freshModule();
    await expect(lib.syncPushSubscription()).resolves.toEqual({ ok: true });
  });

  // The reported bug: the toggle stayed on while the database held nothing.
  it("reports server-rejected when the POST fails", async () => {
    mockFetch(() => ({ status: 500, body: null }));
    const lib = await freshModule();
    const result = await lib.syncPushSubscription();
    expect(result).toMatchObject({ ok: false, reason: "server-rejected" });
  });

  it("reports server-rejected when the POST cannot be sent at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      }),
    );
    const lib = await freshModule();
    expect(await lib.syncPushSubscription()).toMatchObject({
      ok: false,
      reason: "server-rejected",
    });
  });

  it("recovers on retry after the server rejected the first attempt", async () => {
    let attempt = 0;
    mockFetch((url, init) => {
      if (init?.method !== "POST") return { status: 200, body: { registered: true } };
      attempt++;
      return attempt === 1
        ? { status: 500, body: null }
        : { status: 200, body: { ok: true, subscriptionId: "sub_1" } };
    });
    const lib = await freshModule();

    expect(await lib.syncPushSubscription()).toMatchObject({
      ok: false,
      reason: "server-rejected",
    });
    expect(await lib.syncPushSubscription()).toEqual({ ok: true });
  });

  it("reuses a subscription created with the current VAPID key", async () => {
    existingSubscription = makeSubscription(KEY_BYTES);
    mockFetch(() => ({ status: 200, body: { ok: true, subscriptionId: "sub_1" } }));
    const lib = await freshModule();

    await expect(lib.syncPushSubscription()).resolves.toEqual({ ok: true });
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(existingSubscription.unsubscribe).not.toHaveBeenCalled();
  });

  // A rotated key makes every send fail 403 forever, and 403 is not a "gone"
  // status so the dead row is never pruned server-side.
  it("replaces a subscription created with a stale VAPID key", async () => {
    const stale = makeSubscription(new Uint8Array(65).fill(9));
    existingSubscription = stale;
    mockFetch(() => ({ status: 200, body: { ok: true, subscriptionId: "sub_2" } }));
    const lib = await freshModule();

    await expect(lib.syncPushSubscription()).resolves.toEqual({ ok: true });
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("re-subscribes when the existing subscription has no key recorded", async () => {
    const keyless = makeSubscription(null);
    existingSubscription = keyless;
    mockFetch(() => ({ status: 200, body: { ok: true, subscriptionId: "sub_3" } }));
    const lib = await freshModule();

    await lib.syncPushSubscription();
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("reports subscribe-failed when the push service refuses", async () => {
    subscribeMock = vi.fn(async () => {
      throw new Error("Registration failed - push service error");
    });
    installServiceWorkerMock();
    mockFetch(() => ({ status: 200, body: { ok: true, subscriptionId: "x" } }));
    const lib = await freshModule();

    const result = await lib.syncPushSubscription();
    expect(result).toMatchObject({ ok: false, reason: "subscribe-failed" });
    if (!result.ok) expect(result.detail).toMatch(/push service error/);
  });

  // navigator.serviceWorker.ready never rejects and never settles when nothing
  // is registered. Unguarded, this left the toggle spinning and disabled.
  it("gives up with no-service-worker instead of hanging forever", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: new Promise(() => {}),
        getRegistration: vi.fn(async () => undefined),
        register: vi.fn(async () => ({})),
      },
    });
    mockFetch(() => ({ status: 200, body: { ok: true, subscriptionId: "x" } }));
    const lib = await freshModule();

    const pending = lib.syncPushSubscription();
    // resolveRegistration waits SW_READY_TIMEOUT_MS (8s), then unregisters and
    // re-registers once and waits again, so the total ceiling is 16s.
    await vi.advanceTimersByTimeAsync(17_000);
    expect(await pending).toMatchObject({ ok: false, reason: "no-service-worker" });
  });

  it("registers /sw.js itself rather than waiting for the banner to do it", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({
          active: {},
          pushManager: {
            getSubscription: vi.fn(async () => null),
            subscribe: subscribeMock,
          },
        }),
        getRegistration: vi.fn(async () => undefined),
        register: vi.fn(async (url: string) => {
          registeredWorkerUrl = url;
          return {};
        }),
      },
    });
    mockFetch(() => ({ status: 200, body: { ok: true, subscriptionId: "x" } }));
    const lib = await freshModule();

    await lib.syncPushSubscription();
    expect(registeredWorkerUrl).toBe("/sw.js");
  });
});

describe("enablePush", () => {
  it("stops at the permission stage without touching the server", async () => {
    setPermission("denied");
    const fetchMock = mockFetch(() => ({ status: 200, body: {} }));
    const lib = await freshModule();

    expect(await lib.enablePush()).toMatchObject({
      ok: false,
      reason: "permission-denied",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes a dismissed prompt from a blocked site", async () => {
    setPermission("default");
    mockFetch(() => ({ status: 200, body: {} }));
    const lib = await freshModule();

    expect(await lib.enablePush()).toMatchObject({
      ok: false,
      reason: "permission-dismissed",
    });
  });

  it("surfaces the server rejection rather than reporting success", async () => {
    mockFetch(() => ({ status: 401, body: null }));
    const lib = await freshModule();

    const result = await lib.enablePush();
    expect(result).toMatchObject({ ok: false, reason: "server-rejected" });
  });

  it("refuses when an admin is impersonating this user", async () => {
    mockFetch(() => ({ status: 200, body: { ok: true, skipped: "impersonating" } }));
    const lib = await freshModule();

    expect(await lib.enablePush()).toMatchObject({
      ok: false,
      reason: "impersonating",
    });
  });
});

describe("getPushStatus", () => {
  it("is off when permission was never granted, without asking the server", async () => {
    setPermission("default");
    const fetchMock = mockFetch(() => ({ status: 200, body: { registered: true } }));
    const lib = await freshModule();

    const status = await lib.getPushStatus();
    expect(status.enabled).toBe(false);
    expect(status.hasLocalSubscription).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is on when the browser and the server agree", async () => {
    existingSubscription = makeSubscription(KEY_BYTES);
    mockFetch(() => ({ status: 200, body: { registered: true } }));
    const lib = await freshModule();

    const status = await lib.getPushStatus();
    expect(status).toMatchObject({
      hasLocalSubscription: true,
      registeredOnServer: true,
      enabled: true,
    });
  });

  // The browser subscription outlives server-side pruning (404/410 cleanup, or
  // a wholesale delete), so trusting it alone reports "on" and delivers nothing.
  it("re-registers a subscription the server has lost", async () => {
    existingSubscription = makeSubscription(KEY_BYTES);
    let registered = false;
    const fetchMock = mockFetch((url, init) => {
      if (init?.method === "POST") {
        registered = true;
        return { status: 200, body: { ok: true, subscriptionId: "sub_healed" } };
      }
      return { status: 200, body: { registered } };
    });
    const lib = await freshModule();

    const status = await lib.getPushStatus();
    expect(status.enabled).toBe(true);
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST"),
    ).toBe(true);
  });

  it("stays off when healing also fails", async () => {
    existingSubscription = makeSubscription(KEY_BYTES);
    mockFetch((url, init) =>
      init?.method === "POST"
        ? { status: 500, body: null }
        : { status: 200, body: { registered: false } },
    );
    const lib = await freshModule();

    const status = await lib.getPushStatus();
    expect(status).toMatchObject({ hasLocalSubscription: true, enabled: false });
  });

  it("does not re-post when healing is disabled", async () => {
    existingSubscription = makeSubscription(KEY_BYTES);
    const fetchMock = mockFetch(() => ({ status: 200, body: { registered: false } }));
    const lib = await freshModule();

    const status = await lib.getPushStatus({ heal: false });
    expect(status.enabled).toBe(false);
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST"),
    ).toBe(false);
  });
});
