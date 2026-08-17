"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  MessageSquare,
  Archive,
  ChevronDown,
  Folder,
  Handshake,
  Star,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OverflowTabBar, type OverflowTabItem } from "@/components/overflow-tab-bar";
import { cn } from "@/lib/utils";
import {
  listImportantMessages,
  type InboxThread,
  type ImportantMessageDTO,
} from "@/actions/messages";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel, usePresence } from "@/components/realtime/hooks";
import {
  userChannel,
  globalPresenceChannel,
  NOTIFICATION_READ,
  NOTIFICATION_READ_ALL,
} from "@/lib/channels";
import { inboxThreadIdsFromReadPayload } from "@/lib/notification-read";

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

type InboxTab = "all" | "direct" | "project" | "client" | "important";
type InboxGroupId = "project" | "direct" | "client" | "inactive";

const INBOX_TABS: OverflowTabItem<InboxTab>[] = [
  { id: "all", label: "Chats" },
  { id: "project", label: "Projects" },
  { id: "direct", label: "Direct" },
  { id: "client", label: "Clients" },
  { id: "important", label: "Important" },
];

const CLIENT_INBOX_TABS: OverflowTabItem<InboxTab>[] = [
  { id: "all", label: "Chats" },
  { id: "important", label: "Important" },
];

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

export function ThreadSidebar({
  threads,
  isClient = false,
}: {
  threads: InboxThread[];
  isClient?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onThread = useOnThread();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<InboxTab>("all");
  const [openGroups, setOpenGroups] = useState<Record<InboxGroupId, boolean>>({
    project: true,
    direct: true,
    client: true,
    inactive: false,
  });
  const [importantMessages, setImportantMessages] = useState<
    ImportantMessageDTO[]
  >([]);
  const [importantLoading, setImportantLoading] = useState(false);
  // On mobile/tablet the search field is collapsed behind a header icon.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleSearch = () => {
    setSearchOpen((open) => {
      if (open) setQ("");
      return !open;
    });
  };

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (tab !== "important") return;
    let cancelled = false;
    setImportantLoading(true);
    listImportantMessages()
      .then((rows) => {
        if (!cancelled) setImportantMessages(rows);
      })
      .catch(() => {
        if (!cancelled) setImportantMessages([]);
      })
      .finally(() => {
        if (!cancelled) setImportantLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const cent = useCentrifugo();
  const online = usePresence(cent ? globalPresenceChannel() : null);

  // Local copy so realtime inbox events can patch rows in place. Server truth
  // (the `threads` prop) wins on navigation / RSC re-render. Reset via the
  // React-sanctioned "store previous prop in state" pattern (no effect).
  const activeThreadId =
    pathname.startsWith("/dashboard/messages/") &&
    pathname !== "/dashboard/messages"
      ? pathname.slice("/dashboard/messages/".length)
      : null;

  const [liveThreads, setLiveThreads] = useState<InboxThread[]>(threads);
  const [prevThreads, setPrevThreads] = useState(threads);
  if (prevThreads !== threads) {
    setPrevThreads(threads);
    // Opening a thread is a client navigation inside this layout — the
    // server `threads` snapshot can still have unread. Keep the open row
    // cleared so the badge never flashes back.
    setLiveThreads(
      activeThreadId
        ? threads.map((t) =>
            t.id === activeThreadId && t.unread > 0 ? { ...t, unread: 0 } : t,
          )
        : threads,
    );
  }

  // Instant: the unread pill disappears the moment the user opens the thread,
  // without waiting for markThreadRead or a Centrifugo round-trip.
  useEffect(() => {
    if (!activeThreadId) return;
    setLiveThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === activeThreadId);
      if (idx === -1 || prev[idx].unread === 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], unread: 0 };
      return next;
    });
  }, [activeThreadId]);

  // Reconcile the whole list after a realtime coverage gap: the user channel
  // reconnected but its history replay failed (backgrounded longer than the
  // replay window), or the tab was hidden long enough for the WebSocket to
  // have been dropped. Without this, DMs sent meanwhile only appear after a
  // manual refresh.
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (hiddenAtRef.current && Date.now() - hiddenAtRef.current > 10_000) {
        router.refresh();
      }
      hiddenAtRef.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  // Live inbox: patch the affected row from the event delta instead of
  // refetching the whole RSC tree. Falls back to a refresh only when the target
  // row isn't present yet (e.g. a brand-new conversation/thread).
  useChannel(
    cent ? userChannel(cent.memberId) : null,
    (data) => {
    const d = data as
      | {
          type?: string;
          conversationId?: string | null;
          projectId?: string | null;
          taskId?: string | null;
          authorId?: string;
          lastAuthor?: string;
          lastMessage?: string;
          lastAt?: string;
          tags?: string[];
          linkUrls?: string[];
        }
      | null;
    if (!d) return;

    if (d.type === NOTIFICATION_READ_ALL) {
      setLiveThreads((prev) =>
        prev.some((t) => t.unread > 0)
          ? prev.map((t) => (t.unread > 0 ? { ...t, unread: 0 } : t))
          : prev,
      );
      return;
    }

    if (d.type === NOTIFICATION_READ) {
      const ids = new Set(inboxThreadIdsFromReadPayload(d));
      if (ids.size === 0) return;
      setLiveThreads((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (!ids.has(t.id) || t.unread === 0) return t;
          changed = true;
          return { ...t, unread: 0 };
        });
        return changed ? next : prev;
      });
      return;
    }

    if (d.type !== "inbox") return;

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
      // Task-comment notifications are cleared on the task page, not by
      // opening this thread — keep them out of the badge so it matches what
      // the server counts (and what opening the thread clears).
      if (!isSelf && !isViewing && !d.taskId) row.unread = (row.unread ?? 0) + 1;
      next[idx] = row;
      return next;
    });
    },
    // Reconnected but missed events couldn't be replayed — refetch the list.
    () => router.refresh(),
  );

  const allRows = useMemo(() => {
    return liveThreads
      .filter((t) =>
        tab === "all" || tab === "important" ? true : t.kind === tab,
      )
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
  const showInactiveSection = tab !== "important" && inactiveRows.length > 0;
  const groupChats = tab === "all" && !isClient;
  const projectRows = useMemo(
    () => rows.filter((t) => t.kind === "project"),
    [rows],
  );
  const directRows = useMemo(
    () => rows.filter((t) => t.kind === "direct"),
    [rows],
  );
  const clientRows = useMemo(
    () => rows.filter((t) => t.kind === "client"),
    [rows],
  );

  function toggleGroup(id: InboxGroupId) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const importantRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return importantMessages;
    return importantMessages.filter(
      (m) =>
        m.body.toLowerCase().includes(query) ||
        m.authorName.toLowerCase().includes(query) ||
        m.threadName.toLowerCase().includes(query),
    );
  }, [importantMessages, q]);

  return (
    <aside
      className={cn(
        // ~WhatsApp list column: wider than w-80, ~30% of a typical desktop pane.
        "flex-col border-r border-border/60 lg:flex lg:w-[min(420px,32vw)] lg:min-w-[360px] lg:shrink-0",
        onThread ? "hidden lg:flex" : "flex w-full",
      )}
    >

      <div className="flex app-top-bar-tall items-center gap-1 border-b border-border/60 px-4">
        <div className="text-sm font-semibold">Inbox</div>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "ml-auto size-11 rounded-full lg:size-9 lg:hidden",
            searchOpen && "text-foreground bg-surface/80",
          )}
          aria-label="Search conversations"
          onClick={toggleSearch}
        >
          <Search className="h-5 w-5 lg:h-4 lg:w-4" />
        </Button>
      </div>

      <div className="border-b border-border/60 p-3 max-lg:px-4 max-lg:pb-3.5">
        {/* Always shown on desktop; on mobile/tablet only when toggled open. */}
        <div className={cn("relative", !searchOpen && "max-lg:hidden")}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              tab === "important"
                ? "Search important messages"
                : "Search conversations"
            }
            className="h-10 rounded-full border-0 bg-muted pl-10 text-sm shadow-none lg:h-9"
          />
        </div>
        <OverflowTabBar
          className="mt-2.5"
          items={isClient ? CLIENT_INBOX_TABS : INBOX_TABS}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Bottom padding clears the mobile bottom navigation bar. */}
      <ul className="min-h-0 flex-1 overflow-y-auto max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {tab === "important" ? (
          <>
            {importantLoading && importantRows.length === 0 && (
              <li className="px-6 py-12 text-center text-sm text-muted-foreground">
                Loading…
              </li>
            )}
            {!importantLoading && importantRows.length === 0 && (
              <li className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Star className="h-8 w-8 text-muted-foreground/50" />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    No important messages
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Star a message from its menu to find it here.
                  </p>
                </div>
              </li>
            )}
            {importantRows.map((m) => (
              <li key={m.id}>
                <ImportantMessageRow
                  message={m}
                  active={pathname === `/dashboard/messages/${m.threadId}`}
                />
              </li>
            ))}
          </>
        ) : (
          <>
        {rows.length === 0 && !showInactiveSection && (
          <li className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <div className="text-sm font-medium text-foreground">
                {isClient
                  ? "No client chats yet"
                  : tab === "direct"
                    ? "No direct messages yet"
                    : tab === "client"
                      ? "No client chats yet"
                      : tab === "project"
                        ? "No project chats yet"
                        : "No conversations yet"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isClient
                  ? "Waiting for your project team to enable client chat."
                  : tab === "direct"
                    ? "Direct messages appear here when someone messages you."
                    : "Project chats open from each project — one group chat per project."}
              </p>
            </div>
          </li>
        )}
        {groupChats ? (
          <>
            <ThreadGroup
              label="Projects"
              icon={Folder}
              threads={projectRows}
              open={openGroups.project}
              onToggle={() => toggleGroup("project")}
              pathname={pathname}
              online={online}
            />
            <ThreadGroup
              label="Direct"
              icon={MessageSquare}
              threads={directRows}
              open={openGroups.direct}
              onToggle={() => toggleGroup("direct")}
              pathname={pathname}
              online={online}
            />
            <ThreadGroup
              label="Clients"
              icon={Handshake}
              threads={clientRows}
              open={openGroups.client}
              onToggle={() => toggleGroup("client")}
              pathname={pathname}
              online={online}
            />
          </>
        ) : (
          rows.map((thread) => (
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
          ))
        )}

        {showInactiveSection && (
          <ThreadGroup
            label="Inactive projects"
            icon={Archive}
            threads={inactiveRows}
            open={openGroups.inactive}
            onToggle={() => toggleGroup("inactive")}
            pathname={pathname}
            online={online}
          />
        )}
          </>
        )}
      </ul>
    </aside>
  );
}

function unreadTotal(threads: InboxThread[]) {
  return threads.reduce((sum, thread) => sum + Math.max(0, thread.unread), 0);
}

function ThreadGroup({
  label,
  icon: Icon,
  threads,
  open,
  onToggle,
  pathname,
  online,
}: {
  label: string;
  icon: LucideIcon;
  threads: InboxThread[];
  open: boolean;
  onToggle: () => void;
  pathname: string;
  online: Set<string>;
}) {
  if (threads.length === 0) return null;
  const unread = unreadTotal(threads);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-border/40 bg-surface/30 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface/60"
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        {!open && unread > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul>
          {threads.map((thread) => (
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
        </ul>
      )}
    </li>
  );
}

function ImportantMessageRow({
  message,
  active,
}: {
  message: ImportantMessageDTO;
  active: boolean;
}) {
  return (
    <Link
      href={`/dashboard/messages/${message.threadId}?msg=${message.id}`}
      className={cn(
        "flex min-h-[76px] items-center gap-3.5 border-b border-border/30 px-4 py-3.5 transition-colors active:bg-surface/70 hover:bg-surface/60 max-lg:min-h-[80px] max-lg:gap-4 max-lg:px-4 max-lg:py-4 lg:min-h-[68px] lg:py-3",
        active && "bg-surface/80",
      )}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-500/15 max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11">
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium leading-tight max-lg:text-base">
            {message.threadName}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatRelative(message.createdAt)}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          <span className="text-foreground/80">{message.authorName}:</span>{" "}
          {message.body}
        </p>
      </div>
    </Link>
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
        // WhatsApp-like row: tall touch target (~72–80px), large avatar, roomy padding.
        "flex min-h-[76px] items-center gap-3.5 border-b border-border/30 px-4 py-3.5 transition-colors active:bg-surface/70 hover:bg-surface/60 max-lg:min-h-[80px] max-lg:gap-4 max-lg:px-4 max-lg:py-4 lg:min-h-[68px] lg:py-3",
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
            width={52}
            height={52}
            className="h-12 w-12 rounded-full object-cover max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11"
          />
        ) : (
          <div
            className="grid h-12 w-12 place-items-center rounded-full text-sm font-semibold text-white max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11 lg:text-xs"
            style={{ background: thread.avatar }}
            aria-hidden
          >
            {thread.initials}
          </div>
        )}
        {isOnline && (
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[15px] font-medium leading-tight max-lg:text-base",
              thread.unread > 0 && !active && "font-semibold text-foreground",
              thread.inactive && "text-muted-foreground",
            )}
          >
            {thread.name}
          </span>
          {thread.kind === "client" && !thread.inactive && (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-400">
              Client
            </span>
          )}
          {thread.inactive && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              Inactive
            </span>
          )}
          <span
            className={cn(
              "ml-auto shrink-0 text-[11px] leading-none",
              thread.unread > 0 && !active
                ? "font-medium text-primary"
                : "text-muted-foreground",
            )}
          >
            {formatRelative(thread.lastAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] leading-snug max-lg:text-sm",
              thread.unread > 0 && !active
                ? "text-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {thread.lastAuthor
              ? `${thread.lastAuthor}: ${thread.lastMessage}`
              : thread.subtitle}
          </div>
          {thread.unread > 0 && !active && (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">
              {thread.unread > 9 ? "9+" : thread.unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
