"use client";

// The notifications toggle plus the recovery steps for whatever went wrong.
// Replaces a bare Switch that silently did nothing when permission was
// blocked, when the service worker never started, or when the subscription
// never reached the server.

import { useCallback, useState } from "react";
import { Bell, Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  disablePush,
  enablePush,
  pushPlatform,
  showLocalTestBanner,
} from "@/lib/push-client";
import { describePushFailure, type PushEnableReason } from "@/lib/push-enable";
import { usePushStatus } from "@/lib/use-push-status";

export function NotificationSetup({ compact = false }: { compact?: boolean }) {
  const { status, checking, refresh } = usePushStatus();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    reason: PushEnableReason;
    detail?: string;
  } | null>(null);
  const [confirmed, setConfirmed] = useState<"banner" | "quiet" | null>(null);

  // enablePush() must be reached directly from the click/change handler: iOS
  // only honours the permission prompt while the user gesture is still active.
  const attemptEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setConfirmed(null);
    try {
      const result = await enablePush();
      if (result.ok) {
        // Prove it works right now. A server-sent test would be suppressed by
        // the service worker while the app is focused, so this forces the same
        // display path the real banners use.
        const shown = await showLocalTestBanner();
        setConfirmed(shown ? "banner" : "quiet");
      } else {
        setFailure({ reason: result.reason, detail: result.detail });
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [busy, refresh]);

  const attemptDisable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setConfirmed(null);
    try {
      await disablePush();
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [busy, refresh]);

  const support = status?.support;
  const supported = support?.ok !== false;
  const permissionDenied = status?.permission === "denied";

  // Show guidance for the last failed attempt, or up front for a state we
  // already know blocks delivery (iOS browser tab, previously blocked site).
  const shownReason: PushEnableReason | null = failure
    ? failure.reason
    : support && !support.ok
      ? support.reason
      : permissionDenied
        ? "permission-denied"
        : null;

  const guidance = shownReason
    ? describePushFailure(shownReason, pushPlatform())
    : null;
  const detail = failure?.detail ?? (support && !support.ok ? support.detail : undefined);

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
              {status?.enabled
                ? "On for this device."
                : "Get alerts for new messages, mentions, and updates."}
            </div>
          )}
        </div>
        {busy || checking ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        {/* A switch that cannot work is worse than no switch — when the device
            can't subscribe at all, the steps below are the only useful control. */}
        {supported && (
          <Switch
            checked={status?.enabled ?? false}
            onCheckedChange={(next) =>
              void (next ? attemptEnable() : attemptDisable())
            }
            disabled={busy || checking || permissionDenied}
            aria-label="Toggle notifications"
          />
        )}
      </div>

      {confirmed && (
        <p className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-s text-success">
          {confirmed === "banner"
            ? "Notifications are on. We just sent a test banner to this device."
            : "Notifications are on for this device."}
        </p>
      )}

      {guidance && (
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
