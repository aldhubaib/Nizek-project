"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Users,
  Folder,
  MessageSquare,
  PenSquare,
  Archive,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getMessageableMembers,
  getOrCreateDirectConversation,
  type InboxThread,
} from "@/actions/messages";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel, usePresence } from "@/components/realtime/hooks";
import { userChannel, globalPresenceChannel } from "@/lib/channels";

function formatRelative(iso: string) {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

type Member = { id: string; name: string | null; email: string; imageUrl?: string | null };

// True when the user is viewing a specific thread (not the inbox index).
function useOnThread() {
  const pathname = usePathname();
  return (
    pathname.startsWith("/dashboard/messages/") &&
    pathname !== "/dashboard/messages"
  );
}

// Client wrapper for the thread pane: full-screen on mobile only when a
// thread is open, always visible on desktop.
export function MessagesMain({ children }: { children: React.ReactNode }) {
  const onThread = useOnThread();
  return (
    <main
      className={cn(
        "min-w-0 flex-1 flex-col",
        onThread ? "flex" : "hidden lg:flex",
      )}
    >
      {children}
    </main>
  );
}

export function ThreadSidebar({ threads }: { threads: InboxThread[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const onThread = useOnThread();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "project" | "direct">("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const cent = useCentrifugo();
  const online = usePresence(cent ? globalPresenceChannel() : null);

  // Local copy so realtime inbox events can patch rows in place. Server truth
  // (the `threads` prop) wins on navigation / RSC re-render. Reset via the
  // React-sanctioned "store previous prop in state" pattern (no effect).
  const [liveThreads, setLiveThreads] = useState<InboxThread[]>(threads);
  const [prevThreads, setPrevThreads] = useState(threads);
  if (prevThreads !== threads) {
    setPrevThreads(threads);
    setLiveThreads(threads);
  }

  // Live inbox: patch the affected row from the event delta instead of
  // refetching the whole RSC tree. Falls back to a refresh only when the target
  // row isn't present yet (e.g. a brand-new conversation/thread).
  useChannel(cent ? userChannel(cent.memberId) : null, (data) => {
    const d = data as
      | {
          type?: string;
          conversationId?: string | null;
          projectId?: string | null;
          authorId?: string;
          lastAuthor?: string;
          lastMessage?: string;
          lastAt?: string;
        }
      | null;
    if (d?.type !== "inbox") return;

    const rowId = d.conversationId
      ? `conv-${d.conversationId}`
      : d.projectId
        ? `project-${d.projectId}`
        : null;
    if (!rowId) return;

    const isSelf = d.authorId != null && cent != null && d.authorId === cent.memberId;
    const isViewing = pathname === `/dashboard/messages/${rowId}`;

    setLiveThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === rowId);
      if (idx === -1) {
        // Unknown thread (first message of a new conversation) — reconcile once.
        router.refresh();
        return prev;
      }
      const next = [...prev];
      const row = { ...next[idx] };
      if (d.lastMessage != null) row.lastMessage = d.lastMessage;
      if (d.lastAuthor != null) row.lastAuthor = d.lastAuthor;
      if (d.lastAt) row.lastAt = d.lastAt;
      if (!isSelf && !isViewing) row.unread = (row.unread ?? 0) + 1;
      next[idx] = row;
      return next;
    });
  });

  const allRows = useMemo(() => {
    return liveThreads
      .filter((t) => (tab === "all" ? true : t.kind === tab))
      .filter((t) =>
        q
          ? t.name.toLowerCase().includes(q.toLowerCase()) ||
            t.subtitle.toLowerCase().includes(q.toLowerCase())
          : true,
      )
      .sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return tb - ta;
      });
  }, [liveThreads, tab, q]);

  // Inactive projects collapse into their own section (like Falak's archived).
  const rows = useMemo(() => allRows.filter((t) => !t.inactive), [allRows]);
  const inactiveRows = useMemo(
    () => allRows.filter((t) => t.inactive),
    [allRows],
  );
  const showInactiveSection = tab !== "direct" && inactiveRows.length > 0;

  return (
    <aside
      className={cn(
        "flex-col border-r border-border/60 lg:flex lg:w-80 lg:shrink-0",
        onThread ? "hidden lg:flex" : "flex w-full",
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4">
        <div className="text-sm font-semibold">Inbox</div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto rounded-full"
          aria-label="New message"
          onClick={() => setComposeOpen(true)}
        >
          <PenSquare className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b border-border/60 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="mt-2 flex items-center gap-1 rounded-md bg-surface/60 p-0.5">
          {(
            [
              { id: "all" as const, label: "All", icon: Users },
              { id: "project" as const, label: "Projects", icon: Folder },
              { id: "direct" as const, label: "Direct", icon: MessageSquare },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom padding clears the mobile bottom navigation bar. */}
      <ul className="min-h-0 flex-1 overflow-y-auto max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {rows.length === 0 && !showInactiveSection && (
          <li className="p-6 text-center text-xs text-muted-foreground">
            No conversations
          </li>
        )}
        {rows.map((thread) => (
          <li key={thread.id}>
            <ThreadRow
              thread={thread}
              active={pathname === `/dashboard/messages/${thread.id}`}
              isOnline={
                thread.kind === "direct" &&
                thread.peerMemberIds.some((id) => online.has(id))
              }
            />
          </li>
        ))}

        {showInactiveSection && (
          <li>
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              aria-expanded={showInactive}
              className="flex w-full items-center gap-2 border-y border-border/40 bg-surface/30 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface/60"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Inactive projects</span>
              <span className="ml-1 rounded-full bg-surface px-1.5 text-tiny">
                {inactiveRows.length}
              </span>
              <ChevronDown
                className={cn(
                  "ml-auto h-3.5 w-3.5 transition-transform",
                  showInactive && "rotate-180",
                )}
              />
            </button>
            {showInactive && (
              <ul>
                {inactiveRows.map((thread) => (
                  <li key={thread.id}>
                    <ThreadRow
                      thread={thread}
                      active={pathname === `/dashboard/messages/${thread.id}`}
                      isOnline={false}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        online={online}
      />
    </aside>
  );
}

function ThreadRow({
  thread,
  active,
  isOnline,
}: {
  thread: InboxThread;
  active: boolean;
  isOnline: boolean;
}) {
  return (
    <Link
      href={`/dashboard/messages/${thread.id}`}
      className={cn(
        "flex items-start gap-3 border-b border-border/40 px-3 py-3 transition-colors hover:bg-surface/60",
        active && "bg-surface/80",
        !thread.inactive && thread.unread > 0 && !active && "bg-primary/[0.05]",
        thread.inactive && "opacity-70 hover:opacity-100",
        thread.inactive && active && "opacity-100",
      )}
    >
      <div className="relative shrink-0">
        {thread.logoUrl || thread.peerImageUrl ? (
          <Image
            src={(thread.logoUrl ?? thread.peerImageUrl) as string}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div
            className="grid h-9 w-9 place-items-center rounded-full text-tiny font-semibold text-white"
            style={{ background: thread.avatar }}
            aria-hidden
          >
            {thread.initials}
          </div>
        )}
        {isOnline && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-medium", thread.inactive && "text-muted-foreground")}>
            {thread.name}
          </span>
          {thread.inactive && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              Inactive
            </span>
          )}
          <span className="ml-auto shrink-0 text-xxs text-muted-foreground">
            {formatRelative(thread.lastAt)}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {thread.lastAuthor
            ? `${thread.lastAuthor}: ${thread.lastMessage}`
            : thread.subtitle}
        </div>
      </div>
      {thread.unread > 0 && (
        <span className="mt-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
          {thread.unread > 9 ? "9+" : thread.unread}
        </span>
      )}
    </Link>
  );
}

function ComposeDialog({
  open,
  onClose,
  online,
}: {
  open: boolean;
  onClose: () => void;
  online: Set<string>;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getMessageableMembers()
      .then((m) => setMembers(m))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = members.filter((m) => {
    if (!q) return true;
    const name = (m.name ?? m.email).toLowerCase();
    return name.includes(q.toLowerCase());
  });

  const openWith = async (memberId: string) => {
    if (opening) return;
    setOpening(true);
    const res = await getOrCreateDirectConversation(memberId);
    setOpening(false);
    if (res.ok) {
      onClose();
      setQ("");
      router.push(`/dashboard/messages/conv-${res.data}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            className="h-9 pl-8 text-sm"
            autoFocus
          />
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {loading && (
            <li className="p-4 text-center text-xs text-muted-foreground">
              Loading…
            </li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="p-4 text-center text-xs text-muted-foreground">
              No people found
            </li>
          )}
          {filtered.map((m) => {
            const name = m.name ?? m.email;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={opening}
                  onClick={() => openWith(m.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface/60 disabled:opacity-60"
                >
                  <div className="relative shrink-0">
                    {m.imageUrl ? (
                      <Image
                        src={m.imageUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 text-xxs font-semibold text-primary">
                        {name
                          .split(" ")
                          .map((s) => s[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                    )}
                    {online.has(m.id) && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{name}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
