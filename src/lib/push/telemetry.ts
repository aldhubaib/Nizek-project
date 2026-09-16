// Reports this install's push state to POST /api/push/device so an admin can
// see why a phone is not receiving without a screenshot. Throttled and
// de-duplicated client-side; the server throttles again.

import { getDeviceId } from "@/lib/device-id";
import type { PushDeviceReport } from "@/lib/push/device-report";
import { appBuild, currentPermission, isStandaloneDisplayMode, pushPlatform } from "@/lib/push/env";
import type { PushEnableFailure, PushEnableResult } from "@/lib/push/support";

/** Identical state is re-sent at most this often (so lastSeenAt stays fresh). */
const RESEND_SAME_STATE_MS = 5 * 60 * 1000;
/** Changed state is sent at most this often. */
const MIN_INTERVAL_MS = 10_000;

let lastSentKey = "";
let lastSentAt = 0;

export interface DeviceFacts {
  support: PushEnableResult;
  hasSubscription: boolean;
  registered: boolean;
  enabled: boolean;
  lastFailure: PushEnableFailure | null;
}

export function buildDeviceReport(facts: DeviceFacts): PushDeviceReport | null {
  const deviceId = getDeviceId();
  if (!deviceId) return null;
  return {
    deviceId,
    platform: pushPlatform(),
    standalone: isStandaloneDisplayMode(),
    permission: currentPermission(),
    supportReason: facts.support.ok ? null : facts.support.reason,
    hasSubscription: facts.hasSubscription,
    registered: facts.registered,
    enabled: facts.enabled,
    lastReason: facts.lastFailure?.reason ?? null,
    lastDetail: facts.lastFailure?.detail ?? null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    appBuild: appBuild(),
  };
}

function stateKey(r: PushDeviceReport): string {
  return [
    r.permission,
    r.supportReason,
    r.hasSubscription,
    r.registered,
    r.enabled,
    r.lastReason,
    r.standalone,
    r.appBuild,
  ].join("|");
}

/**
 * Fire-and-forget. `force` bypasses the change check (used right after the
 * user's own enable attempt so the admin sees the outcome immediately).
 */
export function reportDeviceState(facts: DeviceFacts, opts: { force?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const report = buildDeviceReport(facts);
  if (!report) return;

  const key = stateKey(report);
  const now = Date.now();
  const changed = key !== lastSentKey;
  if (!opts.force) {
    if (!changed && now - lastSentAt < RESEND_SAME_STATE_MS) return;
    if (changed && now - lastSentAt < MIN_INTERVAL_MS) return;
  }
  lastSentKey = key;
  lastSentAt = now;

  try {
    void fetch("/api/push/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      // Survives the page being backgrounded/closed mid-request (iOS suspend).
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/** Test hook. */
export function _resetTelemetryForTests(): void {
  lastSentKey = "";
  lastSentAt = 0;
}
