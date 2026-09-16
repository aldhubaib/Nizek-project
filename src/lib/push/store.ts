"use client";

// THE push runtime: one module-level store shared by every consumer
// (NotificationGate, account card, diagnostics, PushBootstrap). Replaces the
// four overlapping runtimes (push-notifier, use-push-status, push-client's
// internal heal, and the gate's own probing) whose concurrent pushManager
// calls and duplicate network round-trips produced the iOS spinner saga.
//
// Rules:
//  - all pushManager / registration access is serialised through one chain
//  - one status check in flight at a time; ONE network round-trip per check
//    (GET /api/push/status), and none at all when the 5-minute cache matches
//  - automatic repair at most once per HEAL_COOLDOWN_MS; a failed repair is
//    surfaced as lastFailure and never retried in a loop
//  - the UI derives everything from `view` (state.ts); no component probes
//    the browser on its own

import { useEffect, useSyncExternalStore } from "react";
import type { PushPermissionState, PushPlatform } from "@/lib/push/device-report";
import {
  IS_PRODUCTION,
  currentPermission,
  isStandaloneDisplayMode,
  pushPlatform,
  pushSupportStatus,
  pushSupported,
  withTimeout,
} from "@/lib/push/env";
import {
  registerServiceWorker,
  resolveRegistration,
  unregisterAllForDev,
} from "@/lib/push/registration";
import { derivePushView, shouldAttemptHeal, type PushView } from "@/lib/push/state";
import {
  fetchServerStatus,
  readLocalSubscription,
  requestPermissionFromGesture,
  showLocalTestBanner,
  syncSubscription,
} from "@/lib/push/subscription";
import {
  classifyPermission,
  pushFailure,
  type PushEnableFailure,
  type PushEnableResult,
} from "@/lib/push/support";
import { reportDeviceState } from "@/lib/push/telemetry";

// ─── Snapshot ───────────────────────────────────────────────────────────────

export interface PushSnapshot {
  /** False during SSR/hydration; nothing below is trustworthy until true. */
  mounted: boolean;
  permission: PushPermissionState;
  support: PushEnableResult;
  platform: PushPlatform;
  standalone: boolean;
  hasLocalSubscription: boolean;
  registered: boolean;
  /** null until the first check completes (or when it timed out). */
  enabled: boolean | null;
  /** A status check is in flight. Informational only — never gates. */
  checking: boolean;
  /** An automatic repair is in flight. */
  repairing: boolean;
  /** The user's own enable attempt is in flight. */
  busy: boolean;
  lastFailure: PushEnableFailure | null;
  lastCheckedAt: number | null;
  view: PushView;
}

const SERVER_SNAPSHOT: PushSnapshot = {
  mounted: false,
  permission: "unsupported",
  support: pushFailure("unsupported"),
  platform: "desktop",
  standalone: false,
  hasLocalSubscription: false,
  registered: false,
  enabled: null,
  checking: false,
  repairing: false,
  busy: false,
  lastFailure: null,
  lastCheckedAt: null,
  view: "unsupported",
};

let snapshot: PushSnapshot = SERVER_SNAPSHOT;
let clientInitialised = false;
const listeners = new Set<() => void>();

function withView(s: Omit<PushSnapshot, "view">): PushSnapshot {
  return {
    ...s,
    view: derivePushView({
      support: s.support,
      platform: s.platform,
      standalone: s.standalone,
      permission: s.permission,
      enabled: s.enabled,
      repairing: s.repairing,
      lastFailure: s.lastFailure,
    }),
  };
}

function patch(p: Partial<Omit<PushSnapshot, "view">>): void {
  snapshot = withView({ ...snapshot, ...p });
  for (const l of listeners) l();
}

/** Re-read the synchronous browser facts (permission, support, platform). */
function readEnvironment(): Partial<Omit<PushSnapshot, "view">> {
  return {
    mounted: true,
    permission: currentPermission(),
    support: pushSupportStatus(),
    platform: pushPlatform(),
    standalone: isStandaloneDisplayMode(),
  };
}

function ensureClientSnapshot(): void {
  if (clientInitialised || typeof window === "undefined") return;
  clientInitialised = true;
  snapshot = withView({ ...snapshot, ...readEnvironment() });
}

function getSnapshot(): PushSnapshot {
  ensureClientSnapshot();
  return snapshot;
}
function getServerSnapshot(): PushSnapshot {
  return SERVER_SNAPSHOT;
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ─── Serialised access to the push APIs ─────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_KEY = "nizek:push-status:v2";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedStatus {
  endpoint: string;
  permission: PushPermissionState;
  ts: number;
}

/** A fresh cache entry proves this exact endpoint was registered recently. */
function readCache(): CachedStatus | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedStatus;
    if (!c || typeof c.endpoint !== "string") return null;
    if (Date.now() - c.ts > CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}
function writeCache(endpoint: string): void {
  try {
    const entry: CachedStatus = { endpoint, permission: currentPermission(), ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // full or disabled storage
  }
}
function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

// ─── Status check + automatic repair ────────────────────────────────────────

const MIN_REFRESH_INTERVAL_MS = 3_000;
/** Hard ceiling for one check so `checking` always clears. */
const CHECK_TIMEOUT_MS = 30_000;

let inflight: Promise<void> | null = null;
let lastRefreshAt = 0;
let lastHealAt = 0;

function report(force = false): void {
  reportDeviceState(
    {
      support: snapshot.support,
      hasSubscription: snapshot.hasLocalSubscription,
      registered: snapshot.registered,
      enabled: snapshot.enabled === true,
      lastFailure: snapshot.lastFailure,
    },
    { force },
  );
}

async function runCheck(force: boolean): Promise<void> {
  patch({ ...readEnvironment(), checking: true });

  const env = snapshot;
  if (!env.support.ok || env.permission !== "granted") {
    // Nothing to verify: without permission there is no subscription to hold.
    patch({ hasLocalSubscription: false, registered: false, enabled: false, checking: false });
    if (env.permission !== "granted") clearCache();
    report();
    return;
  }

  const reg = await resolveRegistration();
  if (!reg) {
    patch({ hasLocalSubscription: false, registered: false, enabled: false });
    maybeHeal(null);
    patch({ checking: false, lastCheckedAt: Date.now() });
    report();
    return;
  }

  const sub = await readLocalSubscription(reg);
  const endpoint = sub?.endpoint ?? null;

  let registered = false;
  const cached = !force && endpoint ? readCache() : null;
  if (cached && cached.endpoint === endpoint && cached.permission === "granted") {
    registered = true;
  } else {
    const server = await fetchServerStatus(endpoint);
    if (server === null) {
      // Network/auth failure: keep the previous verdict rather than flipping
      // the UI; the next foreground retries.
      patch({ hasLocalSubscription: sub != null, checking: false, lastCheckedAt: Date.now() });
      report();
      return;
    }
    registered = sub != null && server.registered;
    if (registered && endpoint) writeCache(endpoint);
    else clearCache();
  }

  const enabled = sub != null && registered;
  patch({
    hasLocalSubscription: sub != null,
    registered,
    enabled,
    lastFailure: enabled ? null : snapshot.lastFailure,
    lastCheckedAt: Date.now(),
  });

  if (!enabled) await maybeHeal(reg);

  patch({ checking: false });
  report();
}

/**
 * Automatic repair for "permission granted but no working subscription":
 * iOS cold-start zombie SW, a user who granted permission but never finished
 * subscribing, a rotated endpoint, or a pruned server row.
 */
async function maybeHeal(reg: ServiceWorkerRegistration | null): Promise<void> {
  if (
    !shouldAttemptHeal({
      permission: snapshot.permission,
      enabled: snapshot.enabled,
      supported: pushSupported(),
      lastHealAt,
      now: Date.now(),
    })
  ) {
    return;
  }
  lastHealAt = Date.now();
  patch({ repairing: true });
  try {
    const result = await syncSubscription(reg);
    if (result.ok) {
      if (result.endpoint) writeCache(result.endpoint);
      patch({ hasLocalSubscription: true, registered: true, enabled: true, lastFailure: null });
    } else {
      patch({ enabled: false, lastFailure: { reason: result.reason, detail: result.detail } });
    }
  } catch (err) {
    patch({
      enabled: false,
      lastFailure: {
        reason: "subscribe-failed",
        detail: err instanceof Error ? err.message : String(err),
      },
    });
  } finally {
    patch({ repairing: false });
  }
}

/**
 * Re-verify this device. Non-forced calls are throttled and may be satisfied
 * by the cache; forced calls (after the user acts) always hit the server.
 */
export function refreshPushStatus(opts: { force?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inflight && !opts.force) return inflight;
  const now = Date.now();
  if (!opts.force && now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
    return inflight ?? Promise.resolve();
  }
  lastRefreshAt = now;

  const prev = inflight;
  inflight = (async () => {
    // A forced refresh must observe state from AFTER the caller's action.
    if (prev) await prev.catch(() => {});
    await serialized(async () => {
      const done = await withTimeout(runCheck(Boolean(opts.force)), CHECK_TIMEOUT_MS);
      if (done === null) patch({ checking: false, repairing: false });
    });
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// ─── User gesture: enable ───────────────────────────────────────────────────

export interface EnableOutcome {
  result: PushEnableResult;
  /** A confirmation banner was displayed through the SW. */
  bannerShown: boolean;
}

/**
 * Turn notifications on from a click/tap. requestPermission() is the very
 * first await so the gesture token is still valid on iOS/Android; only then
 * does the (slower) subscribe + server sync run.
 */
export async function enablePushFromGesture(
  opts: { confirmWithBanner?: boolean } = {},
): Promise<EnableOutcome> {
  if (snapshot.busy) {
    return { result: pushFailure("subscribe-failed", "Already in progress."), bannerShown: false };
  }
  const support = pushSupportStatus();
  if (!support.ok) {
    patch({ ...readEnvironment() });
    return { result: support, bannerShown: false };
  }

  const permission = await requestPermissionFromGesture();
  const permissionResult = classifyPermission(permission);
  if (!permissionResult.ok) {
    clearCache();
    patch({
      ...readEnvironment(),
      enabled: false,
      lastFailure: { reason: permissionResult.reason, detail: permissionResult.detail },
    });
    report(true);
    return { result: permissionResult, bannerShown: false };
  }

  patch({ ...readEnvironment(), busy: true, lastFailure: null });
  try {
    const result = await serialized(() => syncSubscription());
    let bannerShown = false;
    if (result.ok) {
      if (result.endpoint) writeCache(result.endpoint);
      lastHealAt = Date.now();
      patch({ hasLocalSubscription: true, registered: true, enabled: true, lastFailure: null });
      if (opts.confirmWithBanner) bannerShown = await showLocalTestBanner();
    } else {
      patch({ enabled: false, lastFailure: { reason: result.reason, detail: result.detail } });
    }
    report(true);
    return { result, bannerShown };
  } catch (err) {
    const failure: PushEnableFailure = {
      reason: "subscribe-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
    patch({ enabled: false, lastFailure: failure });
    report(true);
    return { result: { ok: false, ...failure }, bannerShown: false };
  } finally {
    patch({ busy: false });
  }
}

// ─── Runtime bootstrap (SW registration + foreground/permission listeners) ──

let runtimeStarted = false;

export function startPushRuntime(): void {
  if (runtimeStarted || typeof window === "undefined") return;
  runtimeStarted = true;
  ensureClientSnapshot();

  if (!IS_PRODUCTION) {
    void unregisterAllForDev();
  } else {
    void registerServiceWorker();
  }

  // First verification. iOS rotates endpoints when it suspends the PWA, so
  // every return to the foreground re-verifies (cheap: cache hit when the
  // endpoint is unchanged, one GET otherwise).
  void refreshPushStatus({ force: true });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refreshPushStatus();
  });
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) void refreshPushStatus();
  });

  // Permission can change outside the app (Settings, site info). Not exposed
  // on Safari/iOS — the visibility path covers those.
  if (navigator.permissions?.query) {
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((status) => {
        status.addEventListener("change", () => void refreshPushStatus({ force: true }));
      })
      .catch(() => {});
  }
}

// ─── React binding ──────────────────────────────────────────────────────────

/** Current snapshot for non-React readers (tests, imperative code). */
export function getPushSnapshot(): PushSnapshot {
  return getSnapshot();
}

export function usePushStore(): PushSnapshot {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    startPushRuntime();
  }, []);
  return snap;
}

/** Test hook: reset module state between cases. */
export function _resetPushStoreForTests(): void {
  snapshot = SERVER_SNAPSHOT;
  clientInitialised = false;
  chain = Promise.resolve();
  inflight = null;
  lastRefreshAt = 0;
  lastHealAt = 0;
  runtimeStarted = false;
}
