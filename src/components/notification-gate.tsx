"use client";

/**
 * Push onboarding, two strengths:
 *
 * - Full-screen blocking gate for the states a button of ours cannot fix —
 *   permission blocked at the OS, or an iPhone that has not installed the app.
 * - A dismissible top banner for everything one tap can finish (permission not
 *   asked yet, a retryable failure). "Not now" snoozes it for seven days in
 *   localStorage; the user keeps working meanwhile. Push sending itself is
 *   unchanged — the server still queues for every registered device.
 *
 * Children are ALWAYS rendered; both are overlays layered on top, never a
 * conditional return, so the shell (Centrifugo, service worker, effects) is not
 * mounted and unmounted on every status change.
 *
 * Everything shown here is derived from the push store's `view` (state.ts):
 * the gate never probes the browser itself and is never hidden by a stuck
 * "checking" flag, nor shown while the runtime is still verifying/repairing.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PushGuidancePanel } from "@/components/push-guidance";
import { IS_PRODUCTION } from "@/lib/push/env";
import {
  PROMPT_SNOOZE_KEY,
  describeView,
  isPromptSnoozed,
  promptSnoozeUntil,
  shouldGate,
  shouldPrompt,
} from "@/lib/push/state";
import { enablePushFromGesture, refreshPushStatus, usePushStore } from "@/lib/push/store";

function readSnoozed(): boolean {
  try {
    return isPromptSnoozed(localStorage.getItem(PROMPT_SNOOZE_KEY), Date.now());
  } catch {
    return false;
  }
}

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

  // null until read on the client: localStorage is not available during SSR
  // and the first client render must match the server's.
  const [snoozed, setSnoozed] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnoozed(readSnoozed());
  }, []);
  const snooze = useCallback(() => {
    try {
      localStorage.setItem(PROMPT_SNOOZE_KEY, promptSnoozeUntil(Date.now()));
    } catch {}
    setSnoozed(true);
  }, []);

  const production = { production: IS_PRODUCTION };
  const gated = snap.mounted && shouldGate(snap.view, production);
  const prompting =
    !gated && snap.mounted && snoozed === false && shouldPrompt(snap.view, production);

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
      {prompting && (
        <PromptBanner
          view={snap.view}
          platform={snap.platform}
          failure={snap.lastFailure}
          busy={snap.busy}
          onAction={onAction}
          onDismiss={snooze}
        />
      )}
    </>
  );
}

function PromptBanner({
  view,
  platform,
  failure,
  busy,
  onAction,
  onDismiss,
}: {
  view: ReturnType<typeof usePushStore>["view"];
  platform: ReturnType<typeof usePushStore>["platform"];
  failure: ReturnType<typeof usePushStore>["lastFailure"];
  busy: boolean;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const guidance = describeView(view, platform, failure);
  const [open, setOpen] = useState(false);
  const actionLabel = guidance?.actionLabel ?? "Enable notifications";
  const title =
    view === "repair-failed"
      ? "Notifications stopped working on this device"
      : "Turn on notifications";
  const intro =
    view === "repair-failed"
      ? "Messages and mentions will not reach this device until it is fixed."
      : "Get messages and mentions even when the app is closed. Takes one tap.";

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999] px-3 pt-[max(env(safe-area-inset-top),0.5rem)]"
      role="region"
      aria-label="Notifications setup"
      data-testid="notification-prompt-banner"
      data-view={view}
    >
      <div className="mx-auto max-w-2xl rounded-xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-s font-semibold">{title}</div>
            <p className="text-xs text-muted-foreground">{intro}</p>
            {guidance && (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
              >
                {open ? "Hide details" : "What happens next"}
                <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onDismiss}
            aria-label="Not now"
            data-testid="notification-prompt-dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {open && guidance && (
          <div className="mt-3">
            <PushGuidancePanel
              guidance={guidance}
              detail={view === "repair-failed" ? failure?.detail ?? null : null}
              tone={view === "repair-failed" ? "warn" : "muted"}
            />
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={onAction}
            disabled={busy}
            data-testid="notification-prompt-action"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            {actionLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
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
