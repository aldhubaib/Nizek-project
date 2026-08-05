"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellOff,
  BellRing,
  CheckCheck,
  Circle,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Smartphone,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  getMembersNotificationStatus,
  sendTestNotificationToMember,
  type MemberNotificationStatus,
} from "@/actions/notification-status";
import { PushHealthClient } from "./push-health-client";

type Filter = "all" | "on" | "off";
type View = "members" | "health";

type TestState =
  | { status: "sending" }
  | { status: "done"; pushed: boolean; deviceCount: number }
  | { status: "error" };

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

function OnOffPill({
  icon: Icon,
  label,
  on,
}: {
  icon: typeof Globe;
  label: string;
  on: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        on
          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
          : "border-border bg-card text-muted-foreground/70",
      )}
    >
      <Icon className="h-3 w-3" />
      {label} {on ? "On" : "Off"}
    </span>
  );
}

/**
 * Sends a real test notification (bell + push) to one member and reports how
 * it went: how many devices were pushed to, or that it only reached the
 * in-app bell because the member has no push devices.
 */
function TestButton({
  state,
  onSend,
}: {
  state: TestState | undefined;
  onSend: () => void;
}) {
  if (state?.status === "sending") {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[10px] font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sending…
      </span>
    );
  }
  if (state?.status === "done") {
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-medium",
          state.pushed
            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
            : "border-amber-500/30 bg-amber-500/15 text-amber-400",
        )}
      >
        <CheckCheck className="h-3 w-3" />
        {state.pushed
          ? `Pushed to ${state.deviceCount} device${state.deviceCount === 1 ? "" : "s"}`
          : "Sent to bell only — no push devices"}
      </span>
    );
  }
  if (state?.status === "error") {
    return (
      <span className="inline-flex h-7 items-center rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 text-[10px] font-medium text-destructive">
        Failed to send
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSend}
      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
    >
      <Send className="h-3 w-3" />
      Send test
    </button>
  );
}

/**
 * Everything notification-related about the team in one place, as two tabs:
 * per-member coverage (who has push on where, their last notification and
 * whether they opened it) and the system-wide delivery health that used to be
 * its own settings page.
 */
export function NotificationStatusClient({
  initialView = "members",
}: {
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card p-1 w-fit">
        {(
          [
            { id: "members", label: "Members" },
            { id: "health", label: "Push health" },
          ] as { id: View; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={cn(
              "h-7 rounded-md px-3 text-[12px] font-medium transition-colors",
              view === t.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "members" ? <MembersView /> : <PushHealthClient />}
    </div>
  );
}

function MembersView() {
  const [data, setData] = useState<MemberNotificationStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const sendTest = useCallback((memberId: string) => {
    setTests((t) => ({ ...t, [memberId]: { status: "sending" } }));
    sendTestNotificationToMember(memberId)
      .then((res) =>
        setTests((t) => ({ ...t, [memberId]: { status: "done", ...res } })),
      )
      .catch(() =>
        setTests((t) => ({ ...t, [memberId]: { status: "error" } })),
      )
      .finally(() => {
        // Let the result linger, then return to the button so it can be resent.
        setTimeout(() => {
          setTests((t) => {
            if (t[memberId]?.status === "sending") return t;
            const rest = { ...t };
            delete rest[memberId];
            return rest;
          });
        }, 6000);
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getMembersNotificationStatus()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((m) => {
      const enabled = m.webOn || m.pwaOn;
      if (filter === "on" && !enabled) return false;
      if (filter === "off" && enabled) return false;
      if (!q) return true;
      return (
        (m.name ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading notification status…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-sm text-destructive">
        Failed to load notification status.
      </div>
    );
  }

  const enabledCount = data.filter((m) => m.webOn || m.pwaOn).length;
  const webCount = data.filter((m) => m.webOn).length;
  const pwaCount = data.filter((m) => m.pwaOn).length;
  const offCount = data.length - enabledCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Notification coverage</div>
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
        <Stat label="Notifications on" value={`${enabledCount}/${data.length}`} tone="good" />
        <Stat label="Website" value={String(webCount)} />
        <Stat label="App (PWA)" value={String(pwaCount)} />
        <Stat label="Off / never enabled" value={String(offCount)} tone={offCount > 0 ? "bad" : "good"} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        {(
          [
            { id: "all", label: "All" },
            { id: "on", label: "Enabled" },
            { id: "off", label: "Disabled" },
          ] as { id: Filter; label: string }[]
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors",
              filter === f.id
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border/50 rounded-xl border border-border/60">
        {filtered.map((m) => {
          const enabled = m.webOn || m.pwaOn;
          return (
            <div key={m.id} className="px-3 py-3">
              <div className="flex items-center gap-3">
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-full" />
                ) : (
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {(m.name?.[0] || m.email[0]).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {m.name || m.email}
                    </span>
                    {enabled ? (
                      <BellRing className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    )}
                    {m.unreadCount > 0 && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        {m.unreadCount} unread
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{m.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <OnOffPill icon={Globe} label="Website" on={m.webOn} />
                  <OnOffPill icon={Smartphone} label="App" on={m.pwaOn} />
                  <TestButton state={tests[m.id]} onSend={() => sendTest(m.id)} />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-[11px] text-muted-foreground">
                {m.lastNotification ? (
                  <>
                    <span className="inline-flex items-center gap-1">
                      Last notification{" "}
                      {formatDistanceToNow(new Date(m.lastNotification.createdAt), {
                        addSuffix: true,
                      })}
                      <span className="text-muted-foreground/60">
                        — “{m.lastNotification.title}”
                      </span>
                    </span>
                    {m.lastNotification.read ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCheck className="h-3 w-3" />
                        Opened
                        {m.lastNotification.readAt
                          ? ` ${formatDistanceToNow(new Date(m.lastNotification.readAt), { addSuffix: true })}`
                          : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400">
                        <Circle className="h-2 w-2 fill-current" />
                        Not opened yet
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground/60">
                    Never received a notification
                  </span>
                )}
                {m.lastPushDeliveredAt && (
                  <span className="text-muted-foreground/60">
                    Last push delivered{" "}
                    {formatDistanceToNow(new Date(m.lastPushDeliveredAt), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>

              {m.devices.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 pl-11">
                  {m.devices.map((d) => (
                    <span
                      key={d.id}
                      title={`Last synced ${formatDistanceToNow(new Date(d.lastActiveAt), { addSuffix: true })}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {d.kind === "pwa" ? (
                        <Smartphone className="h-2.5 w-2.5" />
                      ) : (
                        <Globe className="h-2.5 w-2.5" />
                      )}
                      {d.label}
                      {d.kind === "pwa" ? " · PWA" : d.kind === "web" ? " · Web" : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            No members match.
          </p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        “On” means the device holds an active push subscription (permission
        granted), so the member gets OS notifications even with the app closed.
        “Opened” reflects when the member read the notification in the app.
        Members marked Off only see notifications while the app is open — ask
        them to enable notifications from the in-app prompt (iPhone requires
        adding the app to the home screen first).
      </p>
    </div>
  );
}
