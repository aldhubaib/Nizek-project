"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getPushHealth, type PushHealthDTO } from "@/actions/push-health";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div
        className={`text-xl font-semibold tabular-nums ${
          tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Admin observability for notification delivery: who can even receive push,
 * how sends performed over the last 7 days, and what exactly failed. This is
 * the first place to look when someone says "I never get notifications."
 */
export function PushHealthClient() {
  const [data, setData] = useState<PushHealthDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getPushHealth()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading push health…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-sm text-destructive">
        Failed to load push health data.
      </div>
    );
  }

  const rate =
    data.last7d.successRate === null
      ? "—"
      : `${Math.round(data.last7d.successRate * 100)}%`;

  return (
    <div className="space-y-6">
      {/* Configuration alerts — these make push silently dead for EVERYONE. */}
      {!data.vapidConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          VAPID keys are not configured — web push is disabled for all users.
          Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
        </div>
      )}
      {!data.centrifugoConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Centrifugo is not configured — realtime bells and in-app sounds are
          disabled; clients fall back to polling.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Last 7 days</div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex h-7 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Push attempts" value={String(data.last7d.attempts)} />
        <Stat label="Delivered" value={String(data.last7d.delivered)} tone="good" />
        <Stat
          label="Failed"
          value={String(data.last7d.failed)}
          tone={data.last7d.failed > 0 ? "bad" : undefined}
        />
        <Stat
          label="Success rate"
          value={rate}
          tone={
            data.last7d.successRate !== null && data.last7d.successRate < 0.9
              ? "bad"
              : "good"
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Active users" value={String(data.totalUsers)} />
        <Stat
          label="Users with push"
          value={`${data.usersWithPush}/${data.totalUsers}`}
          tone={data.usersWithPush < data.totalUsers ? undefined : "good"}
        />
        <Stat label="Registered devices" value={String(data.totalSubscriptions)} />
      </div>

      {data.last7d.failuresByStatus.length > 0 && (
        <section>
          <div className="mb-2 text-sm font-semibold">Failures by status (7d)</div>
          <div className="divide-y divide-border/50 rounded-xl border border-border/60">
            {data.last7d.failuresByStatus.map((f) => (
              <div
                key={String(f.statusCode)}
                className="flex items-center justify-between px-3 py-2 text-xs"
              >
                <span className="font-medium">
                  {f.statusCode === null
                    ? "Network / no response"
                    : `HTTP ${f.statusCode}`}
                  {f.statusCode === 410 || f.statusCode === 404
                    ? " (expired subscription — auto-removed)"
                    : f.statusCode === 401 || f.statusCode === 403
                      ? " (VAPID key mismatch!)"
                      : ""}
                </span>
                <span className="tabular-nums text-muted-foreground">{f.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 text-sm font-semibold">
          Users with no push device ({data.usersWithoutPush.length})
        </div>
        {data.usersWithoutPush.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-3 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Everyone has at least one device registered for push.
          </div>
        ) : (
          <div className="divide-y divide-border/50 rounded-xl border border-border/60">
            {data.usersWithoutPush.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="font-medium">{u.name ?? u.email}</span>
                <span className="text-muted-foreground">{u.email}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          These people only see notifications while the app is open. Ask them to
          enable notifications from Account → Notifications (iPhone requires
          installing the app to the home screen first).
        </p>
      </section>

      {data.recentFailures.length > 0 && (
        <section>
          <div className="mb-2 text-sm font-semibold">Recent failures</div>
          <div className="divide-y divide-border/50 rounded-xl border border-border/60">
            {data.recentFailures.map((f) => (
              <div key={f.id} className="px-3 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {f.recipientName ?? f.recipientEmail}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {f.endpointHost ?? "unknown endpoint"}
                  {f.statusCode ? ` — HTTP ${f.statusCode}` : " — network error"}
                  {f.error ? ` — ${f.error}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
