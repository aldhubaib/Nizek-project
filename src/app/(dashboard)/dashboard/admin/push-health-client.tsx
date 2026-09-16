"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getPushHealth,
  getPushUserDrilldown,
  type PushFleetDevice,
  type PushHealthDTO,
  type PushUserDrilldownDTO,
} from "@/actions/push-health";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div
        className={`text-l font-semibold tabular-nums ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ago(d: Date | string | null | undefined): string {
  return d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "never";
}

/** Human summary of why a device is not receiving, from its reported state. */
function deviceProblem(d: PushFleetDevice): string | null {
  if (d.enabled) return null;
  if (d.supportReason === "needs-install") return "iPhone browser tab — must Add to Home Screen";
  if (d.supportReason === "needs-safari-install") return "iPhone Chrome tab — must install from Safari";
  if (d.supportReason) return `Unsupported (${d.supportReason})`;
  if (d.permission === "denied") return "Permission denied at OS level";
  if (d.permission === "default") return "Permission never granted";
  if (d.lastReason) return `Repair failed: ${d.lastReason}${d.lastDetail ? ` — ${d.lastDetail}` : ""}`;
  if (d.hasSubscription && !d.registered) return "Subscribed in browser, not registered on server";
  return "Not subscribed";
}

/**
 * Admin observability for notification delivery: who can even receive push,
 * how the pipeline is doing right now (queue, outbox, throughput), every
 * install's reported state, and what exactly failed. First place to look when
 * someone says "I never get notifications."
 */
export function PushHealthClient() {
  const [data, setData] = useState<PushHealthDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [drill, setDrill] = useState<{ userId: string; data: PushUserDrilldownDTO | null } | null>(
    null,
  );

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

  const openUser = useCallback((userId: string) => {
    setDrill({ userId, data: null });
    getPushUserDrilldown(userId)
      .then((d) => setDrill((cur) => (cur?.userId === userId ? { userId, data: d } : cur)))
      .catch(() => setDrill(null));
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-10 text-s text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading push health…
      </div>
    );
  }

  if (!data) {
    return <div className="py-10 text-s text-destructive">Failed to load push health data.</div>;
  }

  const rate =
    data.last7d.successRate === null ? "—" : `${Math.round(data.last7d.successRate * 100)}%`;

  const queueStalled =
    data.queue.reachable &&
    data.queue.waiting + data.queue.active > 0 &&
    (!data.queue.lastCompletedAt ||
      Date.now() - new Date(data.queue.lastCompletedAt).getTime() > 2 * 60 * 1000);
  const outboxStuck =
    data.queue.outboxPending > 0 && (data.queue.outboxOldestAgeMs ?? 0) > 2 * 60 * 1000;

  const fleet = onlyProblems ? data.fleet.filter((d) => !d.enabled) : data.fleet;

  return (
    <div className="space-y-6">
      {!data.vapidConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-s text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          VAPID keys are not configured — web push is disabled for all users. Set
          NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
        </div>
      )}
      {!data.centrifugoConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-orange/40 bg-orange/10 px-3 py-2.5 text-s text-orange">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Centrifugo is not configured — realtime bells and in-app sounds are disabled; clients
          fall back to polling.
        </div>
      )}
      {!data.queue.reachable && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-s text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The push queue (Redis) is unreachable from the web app. Notifications are being held
          in the outbox and will be sent once the worker can reach Redis.
        </div>
      )}
      {(queueStalled || outboxStuck) && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-s text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {queueStalled
            ? "Jobs are queued but nothing completed in the last 2 minutes — the push worker is likely down."
            : "Outbox rows are waiting for dispatch for more than 2 minutes — the worker sweep is not running."}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-s font-semibold">Pipeline right now</div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex h-7 items-center gap-xs rounded-lg border border-border/60 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Queue waiting / active"
          value={data.queue.reachable ? `${data.queue.waiting} / ${data.queue.active}` : "—"}
          tone={queueStalled ? "bad" : undefined}
        />
        <Stat
          label="Failed jobs (kept)"
          value={data.queue.reachable ? String(data.queue.failed) : "—"}
          tone={data.queue.failed > 0 ? "bad" : undefined}
        />
        <Stat
          label="Outbox undispatched"
          value={`${data.queue.outboxPending}${
            data.queue.outboxOldestAgeMs !== null
              ? ` (oldest ${Math.round(data.queue.outboxOldestAgeMs / 1000)}s)`
              : ""
          }`}
          tone={outboxStuck ? "bad" : data.queue.outboxPending === 0 ? "good" : undefined}
        />
        <Stat label="Last job completed" value={ago(data.queue.lastCompletedAt)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sends last hour" value={String(data.lastHour.attempts)} />
        <Stat label="Sends / minute (1h)" value={String(data.lastHour.perMinute)} />
        <Stat
          label="p95 send latency (1h)"
          value={data.lastHour.p95LatencyMs === null ? "—" : `${data.lastHour.p95LatencyMs} ms`}
        />
        <Stat
          label="Delivered last hour"
          value={`${data.lastHour.delivered}/${data.lastHour.attempts}`}
          tone={
            data.lastHour.attempts > 0 && data.lastHour.delivered < data.lastHour.attempts * 0.9
              ? "bad"
              : "good"
          }
        />
      </div>

      <div className="text-s font-semibold">Last 7 days</div>
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
          tone={data.last7d.successRate !== null && data.last7d.successRate < 0.9 ? "bad" : "good"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active users" value={String(data.totalUsers)} />
        <Stat
          label="Users with push"
          value={`${data.usersWithPush}/${data.totalUsers}`}
          tone={data.usersWithPush < data.totalUsers ? undefined : "good"}
        />
        <Stat label="Registered devices" value={String(data.totalSubscriptions)} />
        <Stat
          label="Devices with failures"
          value={String(data.unhealthySubscriptions)}
          tone={data.unhealthySubscriptions > 0 ? "bad" : "good"}
        />
      </div>

      {data.last7d.failuresByStatus.length > 0 && (
        <section>
          <div className="mb-2 text-s font-semibold">Failures by status (7d)</div>
          <div className="divide-y divide-border/50 rounded-xl border border-border/60">
            {data.last7d.failuresByStatus.map((f) => (
              <div
                key={String(f.statusCode)}
                className="flex items-center justify-between px-3 py-2 text-s"
              >
                <span className="font-medium">
                  {f.statusCode === null ? "Network / no response" : `HTTP ${f.statusCode}`}
                  {f.statusCode === 410 || f.statusCode === 404
                    ? " (expired subscription — auto-removed)"
                    : f.statusCode === 401 || f.statusCode === 403
                      ? " (VAPID key mismatch — device re-subscribes on next open; row retired after 5)"
                      : ""}
                </span>
                <span className="tabular-nums text-muted-foreground">{f.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fleet: every install that has reported its state. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-s font-semibold">
            Devices ({fleet.length}
            {onlyProblems ? ` of ${data.fleet.length} need attention` : ""})
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
            />
            Only not enabled
          </label>
        </div>
        {fleet.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-3 text-s text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            {data.fleet.length === 0
              ? "No device has reported yet (devices report on their next app open)."
              : "Every reporting device is enabled."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-s">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">User</th>
                  <th className="px-3 py-2 text-start font-medium">Device</th>
                  <th className="px-3 py-2 text-start font-medium">Permission</th>
                  <th className="px-3 py-2 text-start font-medium">State</th>
                  <th className="px-3 py-2 text-start font-medium">Last seen</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {fleet.map((d) => {
                  const problem = deviceProblem(d);
                  return (
                    <tr key={d.id} className="align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{d.userName ?? d.userEmail}</div>
                        <div className="text-xs text-muted-foreground">{d.userEmail}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {d.platform ?? "?"}
                        {d.standalone === true ? " · app" : d.standalone === false ? " · browser" : ""}
                        {d.appBuild && (
                          <div className="text-xs text-muted-foreground">build {d.appBuild}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{d.permission ?? "?"}</td>
                      <td className="px-3 py-2">
                        {d.enabled ? (
                          <span className="flex items-center gap-1 text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Enabled
                          </span>
                        ) : (
                          <span className="flex items-start gap-1 text-destructive">
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{problem}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {ago(d.lastSeenAt)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openUser(d.userId)}
                          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Details <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 text-s font-semibold">
          Users with no push device ({data.usersWithoutPush.length})
        </div>
        {data.usersWithoutPush.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-3 text-s text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Everyone has at least one device registered for push.
          </div>
        ) : (
          <div className="divide-y divide-border/50 rounded-xl border border-border/60">
            {data.usersWithoutPush.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => openUser(u.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-start text-s hover:bg-muted/20"
              >
                <span className="font-medium">{u.name ?? u.email}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {u.email} <ChevronRight className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          These people only see notifications while the app is open. The app blocks them until
          they enable notifications; the Devices table above shows what each of their phones
          reported.
        </p>
      </section>

      {data.recentFailures.length > 0 && (
        <section>
          <div className="mb-2 text-s font-semibold">Recent failures</div>
          <div className="divide-y divide-border/50 rounded-xl border border-border/60">
            {data.recentFailures.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => openUser(f.recipientId)}
                className="w-full px-3 py-2 text-start hover:bg-muted/20"
              >
                <div className="flex items-center justify-between text-s">
                  <span className="font-medium">{f.recipientName ?? f.recipientEmail}</span>
                  <span className="text-xs text-muted-foreground/70">{ago(f.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {f.endpointHost ?? "unknown endpoint"}
                  {f.statusCode ? ` — HTTP ${f.statusCode}` : " — network error"}
                  {f.error ? ` — ${f.error}` : ""}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {drill && (
        <UserDrilldown drill={drill} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

function UserDrilldown({
  drill,
  onClose,
}: {
  drill: { userId: string; data: PushUserDrilldownDTO | null };
  onClose: () => void;
}) {
  const d = drill.data;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!d ? (
          <div className="flex items-center gap-2 py-6 text-s text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-m font-semibold">{d.user.name ?? d.user.email}</div>
                <div className="text-xs text-muted-foreground">{d.user.email}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <section>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Devices reported ({d.devices.length})
              </div>
              {d.devices.length === 0 ? (
                <div className="text-s text-muted-foreground">
                  No device has reported its state yet.
                </div>
              ) : (
                <div className="divide-y divide-border/50 rounded-xl border border-border/60">
                  {d.devices.map((dev) => (
                    <div key={dev.id} className="px-3 py-2 text-s">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {dev.platform ?? "?"}
                          {dev.standalone === true
                            ? " · installed app"
                            : dev.standalone === false
                              ? " · browser tab"
                              : ""}
                          {dev.appBuild ? ` · build ${dev.appBuild}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">{ago(dev.lastSeenAt)}</span>
                      </div>
                      <div className={`mt-0.5 text-xs ${dev.enabled ? "text-success" : "text-destructive"}`}>
                        {dev.enabled
                          ? `Enabled${dev.lastEnabledAt ? ` (since ${ago(dev.lastEnabledAt)})` : ""}`
                          : deviceProblem(dev)}
                        {" · permission "}
                        {dev.permission ?? "?"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Subscriptions ({d.subscriptions.length})
              </div>
              {d.subscriptions.length === 0 ? (
                <div className="text-s text-muted-foreground">No push subscription on file.</div>
              ) : (
                <div className="divide-y divide-border/50 rounded-xl border border-border/60">
                  {d.subscriptions.map((s) => (
                    <div key={s.id} className="px-3 py-2 text-s">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {s.endpointHost ?? "?"}
                          {s.platform ? ` · ${s.platform}` : ""}
                          {s.standalone === true ? " · app" : s.standalone === false ? " · browser" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">created {ago(s.createdAt)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        last success {ago(s.lastSuccessAt)}
                        {s.failCount > 0 && (
                          <span className="text-destructive">
                            {" · "}
                            {s.failCount} permanent failure{s.failCount === 1 ? "" : "s"}
                            {s.lastFailureStatus ? ` (HTTP ${s.lastFailureStatus})` : ""}
                            {" "}
                            {ago(s.lastFailureAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Last deliveries ({d.deliveries.length})
              </div>
              {d.deliveries.length === 0 ? (
                <div className="text-s text-muted-foreground">No push has been attempted yet.</div>
              ) : (
                <div className="divide-y divide-border/50 rounded-xl border border-border/60">
                  {d.deliveries.map((x) => (
                    <div key={x.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      {x.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {x.type ?? "push"} → {x.endpointHost ?? "?"}
                        {!x.ok && x.statusCode ? ` — HTTP ${x.statusCode}` : ""}
                        {!x.ok && x.error ? ` — ${x.error}` : ""}
                      </span>
                      <span className="shrink-0 text-muted-foreground/60">{ago(x.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
