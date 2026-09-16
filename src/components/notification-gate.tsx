"use client";

/**
 * Full-screen blocking gate: the app cannot be used until this device has
 * notification permission and a server-registered push subscription.
 *
 * Children are ALWAYS rendered; the gate is an overlay layered on top, never a
 * conditional return, so the shell (Centrifugo, service worker, effects) is not
 * mounted and unmounted on every status change.
 *
 * Everything shown here is derived from the push store's `view` (state.ts):
 * the gate never probes the browser itself and is never hidden by a stuck
 * "checking" flag, nor shown while the runtime is still verifying/repairing.
 */

import { useCallback } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PushGuidancePanel } from "@/components/push-guidance";
import { IS_PRODUCTION } from "@/lib/push/env";
import { describeView, shouldGate } from "@/lib/push/state";
import { enablePushFromGesture, refreshPushStatus, usePushStore } from "@/lib/push/store";

export function NotificationGate({ children }: { children: React.ReactNode }) {
  const snap = usePushStore();

  const onAction = useCallback(async () => {
    // "denied" cannot be fixed by a prompt: the button re-checks after the user
    // followed the Settings/reinstall steps. Everything else is an enable.
    if (snap.view === "denied" && Notification.permission === "denied") {
      await refreshPushStatus({ force: true });
      return;
    }
    // Permission is now "default" (Settings toggled / reinstalled) or was never
    // asked: prompt synchronously inside this gesture.
    await enablePushFromGesture();
  }, [snap.view]);

  const gated = snap.mounted && shouldGate(snap.view, { production: IS_PRODUCTION });

  return (
    <>
      {children}
      {gated && (
        <GateOverlay
          view={snap.view}
          platform={snap.platform}
          failure={snap.lastFailure}
          supportDetail={snap.support.ok ? null : snap.support.detail ?? null}
          busy={snap.busy}
          onAction={onAction}
        />
      )}
    </>
  );
}

function GateOverlay({
  view,
  platform,
  failure,
  supportDetail,
  busy,
  onAction,
}: {
  view: ReturnType<typeof usePushStore>["view"];
  platform: ReturnType<typeof usePushStore>["platform"];
  failure: ReturnType<typeof usePushStore>["lastFailure"];
  supportDetail: string | null;
  busy: boolean;
  onAction: () => void;
}) {
  const guidance = describeView(view, platform, failure);
  const actionLabel = guidance ? guidance.actionLabel : "Enable Notifications";
  const detail = failure?.detail ?? supportDetail;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-gate-title"
      data-testid="notification-gate"
      data-view={view}
    >
      <div className="mx-4 max-h-[92dvh] w-full max-w-md space-y-6 overflow-y-auto rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
        <div className="flex justify-center">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Bell className="h-8 w-8" />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h2 id="notification-gate-title" className="text-lg font-semibold">
            Notifications Required
          </h2>
          <p className="text-s text-muted-foreground">
            You must enable notifications to use the system, so you never miss
            messages, mentions, and updates.
          </p>
        </div>

        {guidance && (
          <PushGuidancePanel
            guidance={guidance}
            detail={view === "repair-failed" ? detail : null}
            tone={view === "pre-prompt" ? "muted" : "warn"}
          />
        )}

        {/* Hidden when a button cannot help (iOS tab: the install steps are
            the only way forward). Only the user's own attempt disables it — a
            background check must never lock them out of retrying. */}
        {actionLabel && (
          <Button
            className="w-full"
            size="lg"
            onClick={onAction}
            disabled={busy}
            data-testid="notification-gate-action"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            {actionLabel}
          </Button>
        )}

        {guidance?.showDiagnostics && (
          <p className="text-center text-xs text-muted-foreground">
            Still stuck? Fully close and reopen the app, or contact your admin.
          </p>
        )}
      </div>
    </div>
  );
}
