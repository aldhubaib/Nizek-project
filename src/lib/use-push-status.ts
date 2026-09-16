"use client";

// Keeps components in sync with this device's real push state. Permission can
// change outside the app (iOS Settings, Chrome site settings), so a one-shot
// check on mount leaves the UI stale — this re-reads on permission change and
// whenever the app returns to the foreground.
//
// The state lives in ONE module-level store shared by every mounted consumer
// (NotificationGate, NotificationSetup, ...). Previously each hook instance ran
// its own status check and its own self-heal, and a failed heal force-refreshed
// itself into an endless "checking" loop: the spinner never stopped, the gate
// never appeared, and the real failure reason was swallowed.
//
// Rules that keep it stable:
//  - one in-flight getPushStatus() at a time, raced against a timeout
//  - automatic repair (syncPushSubscription) at most once per HEAL_COOLDOWN_MS
//  - a failed repair is SURFACED as `healFailure`, never retried in a loop
//  - only a SUCCESSFUL repair triggers a follow-up status refresh

import { useEffect, useSyncExternalStore } from "react";
import {
  getPushStatus,
  pushSupported,
  syncPushSubscription,
  type PushStatus,
} from "@/lib/push-client";
import {
  shouldAttemptHeal,
  type PushEnableFailure,
} from "@/lib/push-enable";

const MIN_REFRESH_INTERVAL_MS = 3_000;

// On iOS PWA, getPushStatus() can hang when the service worker is in a zombie
// state after a cold start (pushManager.getSubscription() or fetch never
// settle). These timeouts ensure `checking` / `healing` always clear.
const STATUS_TIMEOUT_MS = 15_000;
const HEAL_TIMEOUT_MS = 20_000;

// ─── localStorage cache ─────────────────────────────────────────────────────

const STATUS_CACHE_KEY = "nizek:push-status";
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedStatus {
  status: PushStatus;
  permission: NotificationPermission | "unsupported";
  ts: number;
}

function currentPermission(): NotificationPermission | "unsupported" {
  return typeof Notification !== "undefined"
    ? Notification.permission
    : "unsupported";
}

function readCachedStatus(): PushStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedStatus = JSON.parse(raw);
    if (Date.now() - cached.ts > STATUS_CACHE_TTL_MS) return null;
    // Invalidate if the browser-level permission changed since we cached.
    if (currentPermission() !== cached.permission) return null;
    return cached.status;
  } catch {
    return null;
  }
}

function writeCachedStatus(status: PushStatus): void {
  try {
    const entry: CachedStatus = {
      status,
      permission: currentPermission(),
      ts: Date.now(),
    };
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage may be full or disabled (private browsing).
  }
}

// ─── Shared store ───────────────────────────────────────────────────────────

export interface PushStatusSnapshot {
  status: PushStatus | null;
  /** A getPushStatus() check is in flight. */
  checking: boolean;
  /** An automatic subscription repair is in flight. */
  healing: boolean;
  /** Why the last automatic repair failed; null when none failed / it worked. */
  healFailure: PushEnableFailure | null;
}

const SERVER_SNAPSHOT: PushStatusSnapshot = {
  status: null,
  checking: true,
  healing: false,
  healFailure: null,
};

let snapshot: PushStatusSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<PushStatusSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PushStatusSnapshot {
  return snapshot;
}

function getServerSnapshot(): PushStatusSnapshot {
  return SERVER_SNAPSHOT;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

let inflight: Promise<void> | null = null;
let lastRefreshAt = 0;
let lastHealAt = 0;
let healInflight: Promise<void> | null = null;

/**
 * Re-read this device's push state. Non-forced calls are throttled and may be
 * served from the localStorage cache; forced calls always hit the browser APIs
 * and the server (used after the user acts, e.g. tapping Enable).
 */
export async function refreshPushStatus(opts?: {
  force?: boolean;
}): Promise<void> {
  if (inflight && !opts?.force) return inflight;
  // A forced refresh must observe state from AFTER the caller's action, so
  // let any stale check settle first and then run a fresh one.
  while (inflight) await inflight;

  const now = Date.now();
  if (!opts?.force) {
    if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;
    const cached = readCachedStatus();
    if (cached) {
      setSnapshot({ status: cached, checking: false });
      return;
    }
  }

  lastRefreshAt = now;
  setSnapshot({ checking: true });
  inflight = (async () => {
    try {
      const next = await withTimeout(getPushStatus(), STATUS_TIMEOUT_MS);
      if (next) {
        writeCachedStatus(next);
        setSnapshot({
          status: next,
          // A device that is fully on has nothing left to repair.
          healFailure: next.enabled ? null : snapshot.healFailure,
        });
      }
      maybeHeal(next ? next.enabled : null);
    } finally {
      setSnapshot({ checking: false });
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Automatic repair for "permission granted but no working subscription":
 * iOS cold-start zombie SW, a user who granted permission but never finished
 * subscribing, or a stale server row. Guarded by a cooldown so a persistent
 * failure is reported once instead of looping.
 */
function maybeHeal(enabled: boolean | null): void {
  if (healInflight) return;
  if (
    !shouldAttemptHeal({
      permission: currentPermission(),
      enabled,
      supported: pushSupported(),
      lastHealAt,
      now: Date.now(),
    })
  ) {
    return;
  }

  lastHealAt = Date.now();
  setSnapshot({ healing: true });
  healInflight = (async () => {
    try {
      const result = await withTimeout(syncPushSubscription(), HEAL_TIMEOUT_MS);
      if (result?.ok) {
        setSnapshot({ healFailure: null });
        await refreshPushStatus({ force: true });
      } else if (result) {
        setSnapshot({
          healFailure: { reason: result.reason, detail: result.detail },
        });
      } else {
        setSnapshot({
          healFailure: {
            reason: "no-service-worker",
            detail: "Timed out waiting for the background service to respond.",
          },
        });
      }
    } catch (err) {
      setSnapshot({
        healFailure: {
          reason: "subscribe-failed",
          detail: err instanceof Error ? err.message : String(err),
        },
      });
    } finally {
      setSnapshot({ healing: false });
      healInflight = null;
    }
  })();
}

// ─── Global listeners (attached while at least one consumer is mounted) ────

let consumers = 0;
let detachGlobal: (() => void) | null = null;

function attachGlobalListeners(): () => void {
  let permissionStatus: PermissionStatus | null = null;
  const onPermissionChange = () => void refreshPushStatus({ force: true });

  if (typeof navigator !== "undefined" && navigator.permissions?.query) {
    navigator.permissions
      // Not in every lib.dom version's PermissionName union.
      .query({ name: "notifications" as PermissionName })
      .then((result) => {
        permissionStatus = result;
        result.addEventListener("change", onPermissionChange);
      })
      .catch(() => {
        // Safari/iOS don't expose the notifications permission here; the
        // visibilitychange path below covers those.
      });
  }

  const onVisibility = () => {
    if (!document.hidden) void refreshPushStatus();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    permissionStatus?.removeEventListener("change", onPermissionChange);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function usePushStatus() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    consumers += 1;
    if (consumers === 1) {
      detachGlobal = attachGlobalListeners();
      // Push state lives entirely in browser APIs and the database, none of it
      // readable during render — the first read can only happen after mount.
      void refreshPushStatus({ force: true });
    } else {
      // Another consumer already primed the store; a cheap (cached/throttled)
      // refresh is enough.
      void refreshPushStatus();
    }
    return () => {
      consumers -= 1;
      if (consumers === 0) {
        detachGlobal?.();
        detachGlobal = null;
      }
    };
  }, []);

  return {
    status: snap.status,
    checking: snap.checking,
    healing: snap.healing,
    healFailure: snap.healFailure,
    refresh: refreshPushStatus,
  };
}
