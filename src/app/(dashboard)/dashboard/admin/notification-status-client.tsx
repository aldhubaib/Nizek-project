"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  Circle,
  Download,
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

/** One of the four headline figures: an icon in its own tint, the number, and
 * what it counts. */
function StatCard({
  icon: Icon,
  value,
  label,
  sub,
  tone,
}: {
  icon: typeof Bell;
  value: string;
  label: string;
  sub: string;
  tone: "primary" | "sky" | "violet" | "bad" | "good";
}) {
  const tones = {
    primary: { chip: "bg-primary/15 text-primary", value: "text-primary" },
    sky: { chip: "bg-sky-500/15 text-sky-400", value: "text-sky-400" },
    violet: { chip: "bg-violet-500/15 text-violet-400", value: "text-violet-400" },
    bad: { chip: "bg-destructive/15 text-destructive", value: "text-destructive" },
    good: { chip: "bg-emerald-500/15 text-emerald-400", value: "text-emerald-400" },
  }[tone];

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4">
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tones.chip)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className={cn("text-xl font-semibold leading-tight tabular-nums", tones.value)}>
          {value}
        </div>
        <div className="mt-0.5 text-[12px] font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function ChannelPill({
  icon: Icon,
  label,
  on,
  title,
}: {
  icon: typeof Globe;
  label: string;
  on: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        on
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-card text-muted-foreground/70",
      )}
    >
      <Icon className="h-3 w-3" />
      {label} {on ? "On" : "Off"}
    </span>
  );
}

/** Opened / Not Opened / No Activity, read off the member's last notification. */
function StatusPill({ m }: { m: MemberNotificationStatus }) {
  if (!m.lastNotification) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        No Activity
      </span>
    );
  }
  if (m.lastNotification.read) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 whitespace-nowrap">
        Opened
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 whitespace-nowrap">
      Not Opened
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
      <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sending…
      </span>
    );
  }
  if (state?.status === "done") {
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-medium whitespace-nowrap",
          state.pushed
            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
            : "border-amber-500/30 bg-amber-500/15 text-amber-400",
        )}
      >
        <CheckCheck className="h-3 w-3" />
        {state.pushed
          ? `Pushed to ${state.deviceCount} device${state.deviceCount === 1 ? "" : "s"}`
          : "Bell only — no devices"}
      </span>
    );
  }
  if (state?.status === "error") {
    return (
      <span className="inline-flex h-7 items-center rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 text-[10px] font-medium text-destructive whitespace-nowrap">
        Failed to send
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSend}
      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground whitespace-nowrap"
    >
      <Send className="h-3 w-3" />
      Send test
    </button>
  );
}

/** The table as a file: what's on screen, one row per member. */
function exportCsv(rows: MemberNotificationStatus[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    [
      "Name",
      "Email",
      "Website",
      "App (PWA)",
      "Last notification",
      "Received at",
      "Opened",
      "Last push delivered",
      "Unread",
    ].join(","),
    ...rows.map((m) =>
      [
        esc(m.name ?? ""),
        esc(m.email),
        m.webOn ? "On" : "Off",
        m.pwaOn ? "On" : "Off",
        esc(m.lastNotification?.title ?? ""),
        m.lastNotification
          ? new Date(m.lastNotification.createdAt).toISOString()
          : "",
        m.lastNotification ? (m.lastNotification.read ? "Yes" : "No") : "",
        m.lastPushDeliveredAt
          ? new Date(m.lastPushDeliveredAt).toISOString()
          : "",
        String(m.unreadCount),
      ].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "notification-coverage.csv";
  a.click();
  URL.revokeObjectURL(url);
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
  const coverage =
    data.length > 0 ? Math.round((enabledCount / data.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Bell className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight">
              Notification coverage
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              Overview of notification channels and status
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={Bell}
          value={`${enabledCount} / ${data.length}`}
          label="Notifications On"
          sub={`${coverage}% coverage`}
          tone="primary"
        />
        <StatCard
          icon={Globe}
          value={String(webCount)}
          label="Website"
          sub="Enabled"
          tone="sky"
        />
        <StatCard
          icon={Smartphone}
          value={String(pwaCount)}
          label="App (PWA)"
          sub="Enabled"
          tone="violet"
        />
        <StatCard
          icon={Ban}
          value={String(offCount)}
          label="Off / Never Enabled"
          sub={`${100 - coverage}% not covered`}
          tone={offCount > 0 ? "bad" : "good"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
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
        <button
          type="button"
          onClick={() => exportCsv(filtered)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
        >
          <Download className="h-3 w-3" />
          Export
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/60 bg-card/60">
              {["User", "Last Notification", "Status", "Channels", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filtered.map((m) => {
              const enabled = m.webOn || m.pwaOn;
              const webDevices = m.devices.filter((d) => d.kind !== "pwa");
              const pwaDevices = m.devices.filter((d) => d.kind === "pwa");
              return (
                <tr key={m.id} className="align-top transition-colors hover:bg-card/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {m.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.imageUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full"
                        />
                      ) : (
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                          {(m.name?.[0] || m.email[0]).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-foreground">
                            {m.name || m.email}
                          </span>
                          {enabled ? (
                            <BellRing className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : (
                            <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                          )}
                          {m.unreadCount > 0 && (
                            <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              {m.unreadCount} unread
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {m.email}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {m.lastNotification ? (
                      <div className="space-y-0.5">
                        <div className="text-[12px] text-foreground">
                          {formatDistanceToNow(
                            new Date(m.lastNotification.createdAt),
                            { addSuffix: true },
                          )}
                        </div>
                        <div className="max-w-64 truncate text-[11px] text-muted-foreground">
                          {m.lastNotification.title}
                        </div>
                        {m.lastNotification.read ? (
                          <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                            <CheckCheck className="h-3 w-3" />
                            Opened
                            {m.lastNotification.readAt
                              ? ` ${formatDistanceToNow(new Date(m.lastNotification.readAt), { addSuffix: true })}`
                              : ""}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <Circle className="h-2 w-2 fill-current" />
                              Not opened yet
                            </span>
                            {m.lastPushDeliveredAt && (
                              <span className="text-muted-foreground/70">
                                · Pushed{" "}
                                {formatDistanceToNow(
                                  new Date(m.lastPushDeliveredAt),
                                  { addSuffix: true },
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="text-[12px] text-foreground">Never</div>
                        <div className="text-[11px] text-muted-foreground/70">
                          Never received a notification
                        </div>
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <StatusPill m={m} />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ChannelPill
                        icon={Globe}
                        label="Website"
                        on={m.webOn}
                        title={
                          webDevices.length > 0
                            ? webDevices.map((d) => d.label).join(", ")
                            : undefined
                        }
                      />
                      <ChannelPill
                        icon={Smartphone}
                        label="App"
                        on={m.pwaOn}
                        title={
                          pwaDevices.length > 0
                            ? pwaDevices.map((d) => d.label).join(", ")
                            : undefined
                        }
                      />
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <TestButton state={tests[m.id]} onSend={() => sendTest(m.id)} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[13px] text-muted-foreground"
                >
                  No members match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
