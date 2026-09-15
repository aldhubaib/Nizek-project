"use client";

/**
 * Full-screen blocking gate that prevents access to the app until the user
 * grants notification permission and the push subscription is registered.
 * Rendered at the shell level so every route is gated.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enablePush, pushSupported, pushPlatform } from "@/lib/push-client";
import { describePushFailure, type PushEnableReason } from "@/lib/push-enable";
import { usePushStatus } from "@/lib/use-push-status";

/** Transient reasons that may self-resolve — the gate retries automatically. */
const TRANSIENT_REASONS: ReadonlySet<PushEnableReason> = new Set([
  "no-service-worker",
  "subscribe-failed",
  "server-rejected",
]);
const AUTO_RETRY_DELAY_MS = 4_000;
const MAX_AUTO_RETRIES = 3;

export function NotificationGate({ children }: { children: React.ReactNode }) {
  const { status, checking, refresh } = usePushStatus();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    reason: PushEnableReason;
    detail?: string;
  } | null>(null);
  const autoRetryCount = useRef(0);

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

  // Auto-retry for transient failures (SW not started yet, network hiccup).
  // Resets the counter once the user is through or taps the button manually.
  const currentReason: PushEnableReason | undefined =
    failure?.reason ??
    (status?.support && !status.support.ok ? status.support.reason : undefined);

  useEffect(() => {
    if (
      !currentReason ||
      !TRANSIENT_REASONS.has(currentReason) ||
      autoRetryCount.current >= MAX_AUTO_RETRIES ||
      busy ||
      checking
    ) {
      return;
    }
    const timer = setTimeout(() => {
      autoRetryCount.current += 1;
      void refresh();
    }, AUTO_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [currentReason, busy, checking, refresh]);

  // Still loading the initial status — don't flash the gate.
  if (checking && !status) return null;

  // Notifications are fully enabled — render the app normally.
  if (status?.enabled) return <>{children}</>;

  // Push isn't supported at all (old browser with no sw) or we're in dev
  // where service workers are deliberately unregistered — let them through
  // so the app isn't permanently locked.
  if (!pushSupported() || process.env.NODE_ENV !== "production") {
    return <>{children}</>;
  }

  // Build guidance for whatever is blocking.
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
          <h2 className="text-lg font-semibold">
            Notifications Required
          </h2>
          <p className="text-s text-muted-foreground">
            You must enable notifications in order to use the system.
            This ensures you never miss important messages, mentions, and
            updates.
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
          onClick={() => void attemptEnable()}
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
