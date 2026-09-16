"use client";

// Notifications status on the Account page (and the compact profile dialog).
// Notifications are mandatory: there is no off switch. The row either
// confirms this device is on, or offers the single action that turns it on,
// with platform-specific guidance from the push state machine.

import { useCallback, useState } from "react";
import { Bell, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { PushGuidancePanel } from "@/components/push-guidance";
import { describeView } from "@/lib/push/state";
import { enablePushFromGesture, refreshPushStatus, usePushStore } from "@/lib/push/store";

export function NotificationSetup({ compact = false }: { compact?: boolean }) {
  const snap = usePushStore();
  const [confirmed, setConfirmed] = useState<"banner" | "quiet" | null>(null);

  const onAction = useCallback(async () => {
    setConfirmed(null);
    if (snap.view === "denied" && Notification.permission === "denied") {
      await refreshPushStatus({ force: true });
      return;
    }
    const outcome = await enablePushFromGesture({ confirmWithBanner: true });
    if (outcome.result.ok) setConfirmed(outcome.bannerShown ? "banner" : "quiet");
  }, [snap.view]);

  const enabled = snap.view === "enabled";
  const working = snap.view === "verifying" || snap.view === "repairing";
  const guidance = describeView(snap.view, snap.platform, snap.lastFailure);
  const actionLabel = guidance ? guidance.actionLabel : enabled ? null : "Enable";
  const supported = snap.view !== "install" && snap.view !== "safari-install" && snap.view !== "unsupported";

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-border/60 bg-card p-3"
          : "rounded-2xl border border-border/60 bg-card p-4"
      }
      data-testid="notification-setup"
      data-view={snap.view}
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
          {supported && (
            <div className={`mt-0.5 text-muted-foreground ${compact ? "text-xs" : "text-s"}`}>
              {enabled
                ? "On for this device. Required to use the app."
                : working
                  ? "Checking this device…"
                  : "Required to use the app — turn them on for this device."}
            </div>
          )}
        </div>

        {working || snap.busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : enabled ? (
          <span className="flex shrink-0 items-center gap-1.5 text-s font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" />
            On
          </span>
        ) : actionLabel && !guidance ? (
          <ActionButton label={actionLabel} busy={snap.busy} onClick={onAction} icon="bell" />
        ) : null}
      </div>

      {confirmed && enabled && (
        <p className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-s text-success">
          {confirmed === "banner"
            ? "Notifications are on. We just sent a test banner to this device."
            : "Notifications are on for this device."}
        </p>
      )}

      {guidance && !enabled && (
        <div className="mt-3 space-y-2.5">
          <PushGuidancePanel guidance={guidance} detail={snap.lastFailure?.detail} />
          <div className="flex flex-wrap items-center gap-2">
            {guidance.actionLabel && (
              <ActionButton
                label={guidance.actionLabel}
                busy={snap.busy}
                onClick={onAction}
                icon="refresh"
              />
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

function ActionButton({
  label,
  busy,
  onClick,
  icon,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  icon: "bell" | "refresh";
}) {
  const Icon = icon === "bell" ? Bell : RefreshCw;
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-s font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
