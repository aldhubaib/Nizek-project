"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import Link from "next/link";
import { Bell, Eye, CheckCheck, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUnreadMentions, getUnreadMentionCount, markMentionRead, markMentionsReadBulk } from "@/actions/dashboard";
import { formatDistanceToNow } from "date-fns";
import { getPusherClient, userChannel } from "@/lib/pusher-client";

interface Mention {
  id: string;
  taskId: string;
  taskTitle: string;
  taskNumber: number;
  taskType: string;
  projectId: string;
  projectName: string;
  comment: string;
  commentedBy: { id: string; name: string | null; imageUrl: string | null };
  commentedAt: string;
}

const POLL_FALLBACK_INTERVAL = 120_000;

interface Props {
  currentUserId?: string;
}

export function NotificationBell({ currentUserId }: Props) {
  const [count, setCount] = useState(0);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(() => {
    getUnreadMentionCount().then(setCount).catch(() => {});
  }, []);

  useEffect(() => {
    fetchCount();

    if (currentUserId) {
      const pusher = getPusherClient();
      if (pusher) {
        const channel = pusher.subscribe(userChannel(currentUserId));
        channel.bind("mention", () => {
          fetchCount();
          setLoaded(false);
        });
        return () => {
          channel.unbind_all();
          pusher.unsubscribe(userChannel(currentUserId));
        };
      }
    }

    const id = setInterval(fetchCount, POLL_FALLBACK_INTERVAL);
    return () => clearInterval(id);
  }, [fetchCount, currentUserId]);

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

  async function handleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!loaded || mentions.length !== count) {
      const data = await getUnreadMentions();
      setMentions(data);
      setCount(data.length);
      setLoaded(true);
    }
  }

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markMentionRead(id);
      setMentions((prev) => prev.filter((m) => m.id !== id));
      setCount((c) => Math.max(0, c - 1));
    });
  }

  function handleMarkAllRead() {
    const ids = mentions.map((m) => m.id);
    startTransition(async () => {
      await markMentionsReadBulk(ids);
      setMentions([]);
      setCount(0);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
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
              <AtSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[13px] font-semibold">Mentions</span>
              {count > 0 && (
                <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-1.5 py-px">
                  {count}
                </span>
              )}
            </div>
            {mentions.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className={cn("flex-1 overflow-y-auto", isPending && "opacity-60 pointer-events-none")}>
            {mentions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell className="w-6 h-6 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
                <p className="text-[12px] text-muted-foreground">All caught up</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {mentions.map((m) => (
                  <div key={m.id} className="flex items-start gap-2.5 px-4 py-3 hover:bg-accent/20 transition-colors group">
                    {m.commentedBy.imageUrl ? (
                      <img src={m.commentedBy.imageUrl} alt="" className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {(m.commentedBy.name ?? "?")[0]}
                      </div>
                    )}
                    <Link
                      href={`/dashboard/projects/${m.projectId}?task=${m.taskId}`}
                      onClick={() => setOpen(false)}
                      className="flex-1 min-w-0"
                    >
                      <div className="text-[11px]">
                        <span className="font-semibold">{m.commentedBy.name}</span>
                        <span className="text-muted-foreground"> in </span>
                        <span className="font-medium">#{m.taskNumber} {m.taskTitle}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{m.comment}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-muted-foreground/50">{m.projectName}</span>
                        <span className="text-[9px] text-muted-foreground/30">·</span>
                        <span className="text-[9px] text-muted-foreground/50">
                          {formatDistanceToNow(new Date(m.commentedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </Link>
                    <button
                      onClick={() => handleMarkRead(m.id)}
                      className="shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                      title="Mark as read"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
