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
import { formatDistanceToNow } from "date-fns";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import { userChannel } from "@/lib/channels";

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

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, POLL_FALLBACK_INTERVAL);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Live: refresh the instant anything lands on our user channel (chat mentions,
  // DMs, task-comment mentions). Falls back to polling when Centrifugo is off.
  const cent = useCentrifugo();
  useChannel(cent && currentUserId ? userChannel(currentUserId) : null, () => {
    if (open) refresh();
    else fetchCount();
  });

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
      startTransition(async () => {
        await markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        );
        setCount((c) => Math.max(0, c - 1));
      });
    }
    setOpen(false);
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setCount(0);
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
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center px-1">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[999] w-[380px] max-h-[480px] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">Notifications</span>
              {count > 0 && (
                <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-1.5 py-px">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleMarkAllRead}
                disabled={isPending || count === 0}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
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
                <p className="text-[12px] text-muted-foreground">All caught up</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {items.map((n) => {
                  const Icon = iconFor(n.type);
                  const inner = (
                    <div
                      className={cn(
                        "flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-accent/20 group",
                        !n.read && "bg-primary/[0.06]",
                      )}
                    >
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary mt-0.5">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12px] font-medium">
                            {n.title}
                          </span>
                          <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/60">
                            {formatDistanceToNow(new Date(n.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
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
                      className="w-full text-left"
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
