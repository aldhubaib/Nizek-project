"use client";

// Notifications status on the Account page plus the recovery steps for
// whatever went wrong. Notifications are mandatory: there is no off switch.
// The row either confirms this device is on, or offers the single action that
// turns it on (with platform-specific guidance when that action can't work).

import { useCallback, useState } from "react";
import { Bell, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import {
  enablePush,
  pushPlatform,
  showLocalTestBanner,
} from "@/lib/push-client";
import {
  describePushFailure,
  type PushEnableFailure,
  type PushEnableReason,
} from "@/lib/push-enable";
import { usePushStatus } from "@/lib/use-push-status";

export function NotificationSetup({ compact = false }: { compact?: boolean }) {
  const { status, checking, healing, healFailure, refresh } = usePushStatus();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PushEnableFailure | null>(null);
  const [confirmed, setConfirmed] = useState<"banner" | "quiet" | null>(null);

  // requestPermission() MUST be the very first await in this handler so the
  // user-gesture token is still active. iOS silently returns "denied" and
  // Android demotes to the quiet mini-infobar if any other async work
  // (setState, SW resolution) runs before this call.
  const attemptEnable = useCallback(async () => {
    if (busy) return;
    setFailure(null);
    setConfirmed(null);

    // 1. Request permission FIRST — must be in user gesture call stack.
    let perm: NotificationPermission;
    try {
      perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
    if (perm !== "granted") {
      await refresh({ force: true });
      return;
    }

    // 2. Permission granted — now do the slower SW + subscription work.
    setBusy(true);
    try {
      const result = await enablePush();
      if (result.ok) {
        const shown = await showLocalTestBanner();
        setConfirmed(shown ? "banner" : "quiet");
      } else {
        setFailure({ reason: result.reason, detail: result.detail });
      }
    } finally {
      setBusy(false);
      await refresh({ force: true });
    }
  }, [busy, refresh]);

  const support = status?.support;
  const supported = support?.ok !== false;
  const permissionDenied = status?.permission === "denied";
  const enabled = status?.enabled === true;

  // Show guidance for the last failed attempt (the user's own, or the
  // background repair's), or up front for a state we already know blocks
  // delivery (iOS browser tab, previously blocked site).
  const effectiveFailure = failure ?? (enabled ? null : healFailure);
  const shownReason: PushEnableReason | null = effectiveFailure
    ? effectiveFailure.reason
    : support && !support.ok
      ? support.reason
      : permissionDenied
        ? "permission-denied"
        : null;

  const guidance = shownReason
    ? describePushFailure(shownReason, pushPlatform())
    : null;
  const detail =
    effectiveFailure?.detail ??
    (support && !support.ok ? support.detail : undefined);

  // The initial check (status === null) is the only time we don't yet know
  // which control to show. Later background checks never hide the control.
  const initialising = status === null && checking;

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-border/60 bg-card p-3"
          : "rounded-2xl border border-border/60 bg-card p-4"
      }
    >
      <div className="flex items-center gap-3">
        <div
          className={`grid shrink-0 place-items-center rounded-lg bg-muted/40 text-foreground ${
            compact ? "size-9" : "size-10 rounded-xl"
          }`}
        >
          <Bell className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-s font-semibold">Notifications</div>
          {/* When this device can't subscribe, the guidance panel below is the
              message — a generic subtitle would only contradict it. */}
          {supported && (
            <div
              className={`mt-0.5 text-muted-foreground ${compact ? "text-xs" : "text-s"}`}
            >
              {enabled
                ? "On for this device. Required to use the app."
                : "Required to use the app — turn them on for this device."}
            </div>
          )}
        </div>

        {initialising || healing ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : enabled ? (
          <span className="flex shrink-0 items-center gap-1.5 text-s font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" />
            On
          </span>
        ) : supported && !guidance ? (
          // No switch: notifications can't be turned off. This is the one way
          // to turn them on for a device that isn't subscribed yet. When there
          // is guidance, its own retry button (if any) is the action instead.
          <button
            type="button"
            onClick={() => void attemptEnable()}
            disabled={busy}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-s font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            Enable
          </button>
        ) : null}
      </div>

      {confirmed && (
        <p className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-s text-success">
          {confirmed === "banner"
            ? "Notifications are on. We just sent a test banner to this device."
            : "Notifications are on for this device."}
        </p>
      )}

      {guidance && !enabled && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="text-s font-semibold">{guidance.title}</div>
          <ol
            className={`mt-1.5 space-y-1 text-s text-muted-foreground ${
              guidance.steps.length > 1 ? "list-decimal ps-4" : ""
            }`}
          >
            {guidance.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {detail && (
            <p className="mt-1.5 text-xs text-muted-foreground/70">{detail}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {guidance.retryLabel && (
              <button
                type="button"
                onClick={() => void attemptEnable()}
                disabled={busy}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-s font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {guidance.retryLabel}
              </button>
            )}
            {guidance.showDiagnostics && !compact && (
              <span className="text-xs text-muted-foreground">
                Still stuck? Open Notification diagnostics below.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
