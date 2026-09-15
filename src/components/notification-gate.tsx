"use client";

/**
 * Full-screen blocking gate that prevents access to the app until the user
 * grants notification permission and the push subscription is registered.
 *
 * IMPORTANT: Children are ALWAYS rendered. The gate is an overlay on top, never
 * a conditional return. This prevents the shell (Centrifugo, service worker,
 * effects) from mounting and unmounting on every status change — which was the
 * root cause of the infinite-loop reports on mobile.
 */

import { useCallback, useState } from "react";
import { Bell, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enablePush, pushSupported, pushPlatform } from "@/lib/push-client";
import { describePushFailure, type PushEnableReason } from "@/lib/push-enable";
import { usePushStatus } from "@/lib/use-push-status";

export function NotificationGate({ children }: { children: React.ReactNode }) {
  const { status, checking, refresh } = usePushStatus();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    reason: PushEnableReason;
    detail?: string;
  } | null>(null);

  const attemptEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await enablePush();
      if (!result.ok) {
        setFailure({ reason: result.reason, detail: result.detail });
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [busy, refresh]);

  // Decide whether to show the blocking overlay. The gate is invisible when:
  //  - still running the initial/refresh status check (no flash)
  //  - notifications are fully enabled
  //  - push isn't supported (old browser, dev mode) — don't lock the app
  const gated =
    !checking &&
    status != null &&
    !status.enabled &&
    pushSupported() &&
    process.env.NODE_ENV === "production";

  return (
    <>
      {children}
      {gated && (
        <GateOverlay
          status={status}
          failure={failure}
          busy={busy}
          checking={checking}
          onEnable={attemptEnable}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overlay — extracted so the main component stays small and readable.
// ---------------------------------------------------------------------------

function GateOverlay({
  status,
  failure,
  busy,
  checking,
  onEnable,
}: {
  status: import("@/lib/push-client").PushStatus | null;
  failure: { reason: PushEnableReason; detail?: string } | null;
  busy: boolean;
  checking: boolean;
  onEnable: () => void;
}) {
  const shownReason: PushEnableReason | null = failure
    ? failure.reason
    : status?.support && !status.support.ok
      ? status.support.reason
      : status?.permission === "denied"
        ? "permission-denied"
        : null;

  const guidance = shownReason
    ? describePushFailure(shownReason, pushPlatform())
    : null;

  const detail =
    failure?.detail ??
    (status?.support && !status.support.ok ? status.support.detail : undefined);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Bell className="h-8 w-8" />
          </div>
        </div>

        {/* Title & body */}
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">Notifications Required</h2>
          <p className="text-s text-muted-foreground">
            You must enable notifications in order to use the system. This
            ensures you never miss important messages, mentions, and updates.
          </p>
        </div>

        {/* Guidance panel when something is wrong */}
        {guidance && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-s font-semibold">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
              {guidance.title}
            </div>
            <ol
              className={`mt-2 space-y-1 text-s text-muted-foreground ${
                guidance.steps.length > 1 ? "list-decimal ps-4" : ""
              }`}
            >
              {guidance.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {detail && (
              <p className="mt-2 text-xs text-muted-foreground/70">{detail}</p>
            )}
          </div>
        )}

        {/* Action button */}
        <Button
          className="w-full"
          size="lg"
          onClick={onEnable}
          disabled={busy || checking}
        >
          {busy || checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {guidance?.retryLabel ?? "Enable Notifications"}
        </Button>

        {guidance?.showDiagnostics && (
          <p className="text-center text-xs text-muted-foreground">
            Still stuck? Try reloading the page or contact your admin.
          </p>
        )}
      </div>
    </div>
  );
}
