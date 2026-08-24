"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Maximize2, AtSign, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationDTO,
} from "@/actions/notifications";
import { getInboxUnreadCount } from "@/actions/messages";
import { formatDistanceToNow } from "date-fns";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import {
  userChannel,
  NOTIFICATION_NEW,
  NOTIFICATION_READ,
  NOTIFICATION_READ_ALL,
} from "@/lib/channels";
import { updateAppBadge } from "@/lib/app-badge";
import { closePushBannersByTags } from "@/lib/close-push-banners";
import { useUnreadStore } from "@/store/unread";

const POLL_FALLBACK_INTERVAL = 60_000;

interface Props {
  currentUserId?: string;
}

function iconFor(type: string) {
  if (type === "mention") return AtSign;
  if (type === "message" || type === "dm") return MessageSquare;
  return Bell;
}

export function NotificationBell({ currentUserId }: Props) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const { setNotificationUnread, setInboxUnread, incrementInbox } = useUnreadStore();

  // Keep the OS app-icon badge in lockstep with the unread count.
  useEffect(() => {
    updateAppBadge(count);
    setNotificationUnread(count);
  }, [count, setNotificationUnread]);

  const refresh = useCallback(() => {
    Promise.all([getNotifications(30), getUnreadCount()])
      .then(([list, c]) => {
        setItems(list);
        setCount(c);
      })
      .catch(() => {});
  }, []);

  const fetchCount = useCallback(() => {
    getUnreadCount().then(setCount).catch(() => {});
  }, []);

  const refreshInboxUnread = useCallback(() => {
    getInboxUnreadCount().then(setInboxUnread).catch(() => {});
  }, [setInboxUnread]);

  const cent = useCentrifugo();

  // Event-driven when realtime is available: seed once, then rely on the user
  // channel. Only fall back to polling when Centrifugo isn't configured.
  useEffect(() => {
    fetchCount();
    refreshInboxUnread();
    if (cent?.enabled) return;
    const id = setInterval(fetchCount, POLL_FALLBACK_INTERVAL);
    return () => clearInterval(id);
  }, [fetchCount, refreshInboxUnread, cent?.enabled]);

  // Reconcile once whenever the realtime connection (re)establishes: history
  // replay covers most missed events, but a fresh read after a gap guarantees
  // the count/list are exactly right.
  const wasConnected = useRef(false);
  useEffect(() => {
    const now = Boolean(cent?.connected);
    if (now && !wasConnected.current) {
      if (open) refresh();
      else fetchCount();
      refreshInboxUnread();
    }
    wasConnected.current = now;
  }, [cent?.connected, open, refresh, fetchCount, refreshInboxUnread]);

  // Reconcile on focus / visibility so a device that was backgrounded (PWA) or
  // asleep catches up on read-state changes made elsewhere.
  useEffect(() => {
    const reconcile = () => {
      if (document.hidden) return;
      if (open) refresh();
      else fetchCount();
      refreshInboxUnread();
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [open, refresh, fetchCount, refreshInboxUnread]);

  // Payload-driven live updates: prepend on new, mark items + set count on read.
  useChannel(
    cent && currentUserId ? userChannel(currentUserId) : null,
    (data) => {
      const payload = data as
        | {
            type?: string;
            notification?: NotificationDTO;
            ids?: string[];
            linkUrls?: string[];
            unread?: number;
            inboxUnread?: number;
          }
        | null;
      if (!payload || typeof payload !== "object") return;

      if (payload.type === NOTIFICATION_NEW && payload.notification) {
        const incoming = payload.notification;
        setItems((prev) => {
          if (prev.some((x) => x.id === incoming.id)) return prev;
          return [incoming, ...prev].slice(0, 30);
        });
        setCount((c) => c + 1);
        if (incoming.linkUrl?.startsWith("/dashboard/messages/")) {
          incrementInbox();
        }
        return;
      }

      if (payload.type === NOTIFICATION_READ) {
        const ids = new Set(payload.ids ?? []);
        const urls = new Set(payload.linkUrls ?? []);
        setItems((prev) =>
          prev.map((x) =>
            ids.has(x.id) || (x.linkUrl && urls.has(x.linkUrl))
              ? { ...x, read: true }
              : x,
          ),
        );
        if (typeof payload.unread === "number") setCount(Math.max(0, payload.unread));
        if (typeof payload.inboxUnread === "number") setInboxUnread(payload.inboxUnread);
        return;
      }

      if (payload.type === NOTIFICATION_READ_ALL) {
        setItems((prev) => prev.map((x) => ({ ...x, read: true })));
        setCount(typeof payload.unread === "number" ? Math.max(0, payload.unread) : 0);
        setInboxUnread(0);
        return;
      }
    },
    // Stale recovery: refetch when history replay failed after reconnect
    () => {
      refresh();
      refreshInboxUnread();
    },
  );

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    refresh();
  }

  function handleClick(n: NotificationDTO) {
    if (!n.read) {
      // Optimistic: badge and row update before the server round-trip so the
      // current tab never waits on mark-read / Centrifugo.
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      setCount((c) => Math.max(0, c - 1));
      if (n.tag) void closePushBannersByTags([n.tag]);
      startTransition(() => {
        void markNotificationRead(n.id);
      });
    }
    setOpen(false);
  }

  function handleMarkAllRead() {
    startTransition(() => {
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setCount(0);
      void markAllNotificationsRead();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-xs font-bold text-primary-foreground flex items-center justify-center px-1">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[999] w-[380px] max-h-[480px] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-s font-semibold">Notifications</span>
              {count > 0 && (
                <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-1.5 py-px">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleMarkAllRead}
                disabled={isPending || count === 0}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title="Mark all read"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
              <Link
                href="/dashboard/messages"
                onClick={() => setOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Open inbox"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div
            className={cn(
              "flex-1 overflow-y-auto",
              isPending && "opacity-60 pointer-events-none",
            )}
          >
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell
                  className="w-6 h-6 text-muted-foreground/20 mb-2"
                  strokeWidth={1.5}
                />
                <p className="text-s text-muted-foreground">All caught up</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {items.map((n) => {
                  const Icon = iconFor(n.type);
                  const inner = (
                    <div
                      className={cn(
                        "flex items-start gap-s px-4 py-3 transition-colors hover:bg-accent/20 group",
                        !n.read && "bg-primary/[0.06]",
                      )}
                    >
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary mt-0.5">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-s font-medium">
                            {n.title}
                          </span>
                          <span className="ms-auto shrink-0 text-xs text-muted-foreground/60">
                            {formatDistanceToNow(new Date(n.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.body}
                          </p>
                        )}
                      </div>
                      {!n.read && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                  );

                  return n.linkUrl ? (
                    <Link
                      key={n.id}
                      href={n.linkUrl}
                      onClick={() => handleClick(n)}
                      className="block"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleClick(n)}
                      className="w-full text-start"
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
