"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Send,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getPushDiagnostics,
  sendTestNotification,
  type PushDiagnosticsDTO,
} from "@/actions/push-diagnostics";
import { pushSupported, isPushEnabled } from "@/lib/push-client";
import {
  getAudioReadiness,
  isNotificationSoundEnabled,
  playNotificationSound,
} from "@/lib/notification-sound";

type CheckState = "ok" | "warn" | "fail";

function StatusIcon({ state }: { state: CheckState }) {
  if (state === "ok")
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (state === "warn")
    return <AlertTriangle className="h-3.5 w-3.5 text-orange" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" />;
}

function CheckRow({
  state,
  label,
  detail,
}: {
  state: CheckState;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="mt-0.5 shrink-0">
        <StatusIcon state={state} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-s font-medium">{label}</div>
        {detail && (
          <div className="text-xs text-muted-foreground">{detail}</div>
        )}
      </div>
    </div>
  );
}

/**
 * "Why am I not getting notifications?" panel. Every check maps to a real
 * failure mode we've seen: denied permission, missing subscription, VAPID not
 * configured, locked audio, or push-service delivery errors.
 */
export function NotificationDiagnostics() {
  const [open, setOpen] = useState(false);
  const [server, setServer] = useState<PushDiagnosticsDTO | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [swRegistered, setSwRegistered] = useState(false);
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [audio, setAudio] = useState<"unlocked" | "suspended" | "unavailable">("unavailable");
  const [soundOn, setSoundOn] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
    setAudio(getAudioReadiness());
    setSoundOn(isNotificationSoundEnabled());

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      setSwRegistered(Boolean(reg?.active));
    }
    setDeviceSubscribed(await isPushEnabled());
    try {
      setServer(await getPushDiagnostics());
    } catch {
      setServer(null);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendTestNotification();
      setTestResult(
        res.deviceCount === 0
          ? "Sent to the bell only — no devices are registered for push."
          : `Sent to your bell and ${res.deviceCount} device${res.deviceCount === 1 ? "" : "s"}. Check the delivery log below.`,
      );
      // Also demo the in-app chime path.
      playNotificationSound(true);
      await refresh();
    } catch {
      setTestResult("Test failed — the server rejected the request.");
    } finally {
      setTesting(false);
    }
  };

  const supported = pushSupported();

  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-start"
      >
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/40 text-foreground">
          <Activity className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-s font-semibold">Notification diagnostics</div>
          <div className="mt-0.5 text-s text-muted-foreground">
            Check why notifications or sounds might not arrive on this device.
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 pb-4 pt-2">
          <CheckRow
            state={supported ? "ok" : "fail"}
            label="Browser supports push"
            detail={
              supported
                ? undefined
                : "This browser can't receive push. On iPhone, install the app to your home screen first."
            }
          />
          <CheckRow
            state={
              permission === "granted"
                ? "ok"
                : permission === "default"
                  ? "warn"
                  : "fail"
            }
            label="Notification permission"
            detail={
              permission === "granted"
                ? undefined
                : permission === "denied"
                  ? "Blocked — allow notifications for this site in your browser settings."
                  : "Not requested yet — use the Notifications toggle above."
            }
          />
          <CheckRow
            state={swRegistered ? "ok" : "fail"}
            label="Service worker active"
            detail={swRegistered ? undefined : "Reload the app to register it."}
          />
          <CheckRow
            state={deviceSubscribed ? "ok" : "warn"}
            label="This device is subscribed"
            detail={
              deviceSubscribed
                ? undefined
                : "Turn on the Notifications toggle above to subscribe this device."
            }
          />
          {server && (
            <>
              <CheckRow
                state={server.vapidConfigured ? "ok" : "fail"}
                label="Server push keys configured"
                detail={
                  server.vapidConfigured
                    ? undefined
                    : "VAPID keys are missing on the server — no push can be sent to anyone. Contact an admin."
                }
              />
              <CheckRow
                state={server.centrifugoConfigured ? "ok" : "warn"}
                label="Realtime service configured"
                detail={
                  server.centrifugoConfigured
                    ? undefined
                    : "Live updates fall back to polling; in-app chimes won't fire."
                }
              />
              <CheckRow
                state={server.subscriptionCount > 0 ? "ok" : "warn"}
                label={`Registered devices: ${server.subscriptionCount}`}
                detail={
                  server.subscriptionCount === 0
                    ? "No device of yours can receive push right now."
                    : undefined
                }
              />
            </>
          )}
          <CheckRow
            state={
              !soundOn ? "warn" : audio === "unlocked" ? "ok" : audio === "suspended" ? "warn" : "fail"
            }
            label="In-app sound"
            detail={
              !soundOn
                ? "Sound is turned off in your preferences."
                : audio === "unlocked"
                  ? undefined
                  : audio === "suspended"
                    ? "Audio is waiting for your first tap/click on the page (browser autoplay rule)."
                    : "Audio isn't available in this browser."
            }
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={testing}
              className="flex h-8 items-center gap-xs rounded-lg bg-primary px-3 text-s font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send test notification
            </button>
            {testResult && (
              <span className="text-xs text-muted-foreground">{testResult}</span>
            )}
          </div>

          {server && server.recentDeliveries.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent push deliveries
              </div>
              <div className="divide-y divide-border/50 rounded-lg border border-border/60">
                {server.recentDeliveries.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <StatusIcon state={d.ok ? "ok" : "fail"} />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {d.endpointHost ?? "unknown endpoint"}
                      {!d.ok && d.statusCode ? ` — HTTP ${d.statusCode}` : ""}
                      {!d.ok && d.error ? ` — ${d.error}` : ""}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground/60">
                      {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
