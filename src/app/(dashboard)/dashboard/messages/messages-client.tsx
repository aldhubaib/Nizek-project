"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useTransition } from "react";
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
  PenSquare,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OverflowTabBar, type OverflowTabItem } from "@/components/overflow-tab-bar";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";
import {
  listImportantMessages,
  getMessageableMembers,
  getOrCreateDirectConversation,
  type InboxThread,
  type ImportantMessageDTO,
} from "@/actions/messages";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { usePresence } from "@/components/realtime/hooks";
import { globalPresenceChannel } from "@/lib/channels";
import { useNotificationStore } from "@/store/notifications";
import { prefetchInboxThread } from "@/lib/thread-cache";

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
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        onThread ? "flex" : "hidden lg:flex",
      )}
    >
      {children}
    </main>
  );
}

type MessageableMember = {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
};

function NewMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<MessageableMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLoading(true);
    getMessageableMembers()
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 100);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  }, [members, search]);

  function selectMember(member: MessageableMember) {
    startTransition(async () => {
      const result = await getOrCreateDirectConversation(member.id);
      if (result.ok) {
        onOpenChange(false);
        window.dispatchEvent(
          new CustomEvent("inbox:thread-created", {
            detail: {
              threadId: result.data,
              name: member.name ?? member.email,
              subtitle: member.name ? member.email : "",
              peerImageUrl: member.imageUrl,
              peerMemberIds: [member.id],
            },
          }),
        );
        router.push(`/dashboard/messages/${result.data}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            className="h-10 rounded-lg border-border/60 ps-10 text-s"
          />
        </div>
        <ul className="max-h-72 divide-y divide-border/40 overflow-y-auto -mx-6 px-6">
          {loading && (
            <li className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </li>
          )}
          {!loading && filtered.length === 0 && (
            <li className="py-8 text-center text-s text-muted-foreground">
              {search ? "No one found" : "No team members"}
            </li>
          )}
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={pending}
                className="flex w-full items-center gap-3 py-3 text-start transition-colors hover:bg-surface/60 disabled:opacity-50"
                onClick={() => selectMember(m)}
              >
                {m.imageUrl ? (
                  <Image
                    src={m.imageUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-s font-semibold text-primary">
                    {(m.name ?? m.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-s font-medium">
                    {m.name ?? m.email}
                  </div>
                  {m.name && (
                    <div className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
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
  const [composeOpen, setComposeOpen] = useState(false);
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
  const chromeRef = useRef<HTMLDivElement>(null);
  const [chromeH, setChromeH] = useState(120);

  useLayoutEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const update = () => setChromeH(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [searchOpen]);

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
  const currentMemberId = cent?.memberId ?? "";
  const threadUnread = useNotificationStore((s) => s.threadUnread);
  const threadPreviews = useNotificationStore((s) => s.threadPreviews);
  const lastInboxThreadId = useNotificationStore((s) => s.lastInboxThreadId);
  const inboxResync = useNotificationStore((s) => s.inboxResync);
  const hydrateInboxThreads = useNotificationStore((s) => s.hydrateInboxThreads);
  const replaceInboxThreads = useNotificationStore((s) => s.replaceInboxThreads);
  const clearThreadUnread = useNotificationStore((s) => s.clearThreadUnread);

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
    setLiveThreads(threads);
  }

  // Instant: the unread pill disappears the moment the user opens the thread,
  // without waiting for markThreadRead or a Centrifugo round-trip.
  useEffect(() => {
    if (!activeThreadId) return;
    clearThreadUnread(activeThreadId);
    setLiveThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === activeThreadId);
      if (idx === -1 || prev[idx].unread === 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], unread: 0 };
      return next;
    });
  }, [activeThreadId, clearThreadUnread]);

  useEffect(() => {
    hydrateInboxThreads(threads, activeThreadId);
  }, [threads, activeThreadId, hydrateInboxThreads]);

  const hiddenAtRef = useRef<number | null>(null);
  const lastResync = useRef(inboxResync);
  const pendingReplace = useRef(false);
  useEffect(() => {
    if (inboxResync === lastResync.current) return;
    lastResync.current = inboxResync;
    pendingReplace.current = true;
    router.refresh();
  }, [inboxResync, router]);

  useEffect(() => {
    if (!pendingReplace.current) return;
    pendingReplace.current = false;
    replaceInboxThreads(threads, activeThreadId);
  }, [threads, activeThreadId, replaceInboxThreads]);

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

  useEffect(() => {
    if (!lastInboxThreadId) return;
    if (liveThreads.some((t) => t.id === lastInboxThreadId)) return;
    router.refresh();
  }, [lastInboxThreadId, liveThreads, router]);

  useEffect(() => {
    function onThreadCreated(e: Event) {
      const d = (e as CustomEvent).detail as {
        threadId: string;
        name: string;
        subtitle: string;
        peerImageUrl: string | null;
        peerMemberIds: string[];
      } | null;
      if (!d) return;
      setLiveThreads((prev) => {
        if (prev.some((t) => t.id === d.threadId)) return prev;
        const initials = (d.name ?? "?")
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2);
        const thread: InboxThread = {
          id: d.threadId,
          kind: "direct",
          name: d.name,
          subtitle: d.subtitle,
          projectId: null,
          conversationId: d.threadId.replace("conv-", ""),
          logoUrl: null,
          peerImageUrl: d.peerImageUrl,
          peerMemberIds: d.peerMemberIds,
          lastMessage: "",
          lastAuthor: "",
          lastAt: new Date().toISOString(),
          unread: 0,
          avatar: "#6366f1",
          initials,
          inactive: false,
        };
        return [thread, ...prev];
      });
    }

    function onMessageEnqueued(e: Event) {
      const d = (e as CustomEvent).detail as {
        threadKey: string;
        body: string;
        createdAt: string;
      } | null;
      if (!d) return;
      const preview = d.body.replace(/<[^>]+>/g, "").trim().slice(0, 120) || "";
      setLiveThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === d.threadKey);
        if (idx === -1) return prev;
        const updated = {
          ...prev[idx],
          lastMessage: preview,
          lastAuthor: "You",
          lastAt: d.createdAt,
        };
        const next = [...prev];
        next.splice(idx, 1);
        return [updated, ...next];
      });
    }

    window.addEventListener("inbox:thread-created", onThreadCreated);
    window.addEventListener("inbox:message-enqueued", onMessageEnqueued);
    return () => {
      window.removeEventListener("inbox:thread-created", onThreadCreated);
      window.removeEventListener("inbox:message-enqueued", onMessageEnqueued);
    };
  }, []);

  const allRows = useMemo(() => {
    return liveThreads
      .map((t) => {
        const preview = threadPreviews[t.id];
        const unread =
          t.id === activeThreadId
            ? 0
            : (threadUnread[t.id] ?? t.unread);
        const previewNewer =
          preview &&
          (!t.lastAt ||
            new Date(preview.lastAt).getTime() >= new Date(t.lastAt).getTime());
        return {
          ...t,
          unread,
          lastMessage: previewNewer ? preview.lastMessage : t.lastMessage,
          lastAuthor: previewNewer ? preview.lastAuthor : t.lastAuthor,
          lastAt: previewNewer ? preview.lastAt : t.lastAt,
        };
      })
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
  }, [liveThreads, tab, q, threadPreviews, threadUnread, activeThreadId]);

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
        "relative h-full min-h-0 flex-col border-e border-border/60 lg:w-[min(420px,32vw)] lg:min-w-[360px] lg:shrink-0",
        onThread ? "hidden lg:flex" : "flex w-full",
      )}
    >
      <div
        ref={chromeRef}
        className="absolute inset-x-0 top-0 z-20 flex app-top-bar-tall flex-col items-stretch gap-0 border-b border-border/60 pb-3.5"
      >
        <div className="flex items-center gap-1">
          <div className="page-name text-foreground">Inbox</div>
          {!isClient && (
            <Button
              variant="ghost"
              size="icon"
              className="ms-auto size-11 rounded-full lg:size-9"
              aria-label="New message"
              onClick={() => setComposeOpen(true)}
            >
              <PenSquare className="h-5 w-5 lg:h-4 lg:w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-11 rounded-full lg:size-9 lg:hidden",
              !isClient ? "" : "ms-auto",
              searchOpen && "text-foreground bg-surface/80",
            )}
            aria-label="Search conversations"
            onClick={toggleSearch}
          >
            <Search className="h-5 w-5 lg:h-4 lg:w-4" />
          </Button>
        </div>
        {/* Always shown on desktop; on mobile/tablet only when toggled open. */}
        <div className={cn("relative mt-2.5", !searchOpen && "max-lg:hidden")}>
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
            className="h-10 rounded-full border-0 bg-muted ps-10 text-s shadow-none lg:h-9"
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
      <ul
        data-scroll-lock-root
        className="min-h-0 flex-1 overflow-y-auto max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]"
        style={{ paddingTop: chromeH }}
      >
        {tab === "important" ? (
          <>
            {importantLoading && importantRows.length === 0 && (
              <li className="px-6 py-12 text-center text-s text-muted-foreground">
                Loading…
              </li>
            )}
            {!importantLoading && importantRows.length === 0 && (
              <li className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Star className="h-8 w-8 text-muted-foreground/50" />
                <div>
                  <div className="text-s font-medium text-foreground">
                    No important messages
                  </div>
                  <p className="mt-1 text-s text-muted-foreground">
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
              <div className="text-s font-medium text-foreground">
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
              <p className="mt-1 text-s text-muted-foreground">
                {isClient
                  ? "Waiting for your project team to enable client chat."
                  : tab === "direct"
                    ? "Tap the compose button to start a conversation."
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
              currentMemberId={currentMemberId}
            />
            <ThreadGroup
              label="Direct"
              icon={MessageSquare}
              threads={directRows}
              open={openGroups.direct}
              onToggle={() => toggleGroup("direct")}
              pathname={pathname}
              online={online}
              currentMemberId={currentMemberId}
            />
            <ThreadGroup
              label="Clients"
              icon={Handshake}
              threads={clientRows}
              open={openGroups.client}
              onToggle={() => toggleGroup("client")}
              pathname={pathname}
              online={online}
              currentMemberId={currentMemberId}
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
                currentMemberId={currentMemberId}
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
            currentMemberId={currentMemberId}
          />
        )}
          </>
        )}
      </ul>
      {!isClient && (
        <NewMessageDialog open={composeOpen} onOpenChange={setComposeOpen} />
      )}
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
  currentMemberId,
}: {
  label: string;
  icon: LucideIcon;
  threads: InboxThread[];
  open: boolean;
  onToggle: () => void;
  pathname: string;
  online: Set<string>;
  currentMemberId: string;
}) {
  if (threads.length === 0) return null;
  const unread = unreadTotal(threads);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-border/40 bg-surface/30 px-app py-2.5 text-s font-medium text-muted-foreground transition-colors hover:bg-surface/60"
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        {!open && unread > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-none text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ms-auto h-3.5 w-3.5 transition-transform",
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
                currentMemberId={currentMemberId}
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
        "flex min-h-[76px] items-center gap-m border-b border-border/30 px-app py-3.5 transition-colors active:bg-surface/70 hover:bg-surface/60 max-lg:min-h-[80px] max-lg:gap-4 max-lg:py-4 lg:min-h-[68px] lg:py-3",
        active && "bg-surface/80",
      )}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-orange/15 max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11">
        <Star className="h-5 w-5 fill-orange text-orange" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-s font-medium leading-tight">
            {message.threadName}
          </span>
          <span className="ms-auto shrink-0 text-s text-muted-foreground">
            {formatRelative(message.createdAt)}
          </span>
        </div>
        <p className="truncate text-s text-muted-foreground">
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
  currentMemberId,
}: {
  thread: InboxThread;
  active: boolean;
  isOnline: boolean;
  currentMemberId: string;
}) {
  const prefetch = () => {
    if (active) return;
    prefetchInboxThread(thread, currentMemberId);
  };
  return (
    <Link
      href={`/dashboard/messages/${thread.id}`}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      className={cn(
        // WhatsApp-like row: tall touch target (~72–80px), large avatar, roomy padding.
        "flex min-h-[76px] items-center gap-m border-b border-border/30 px-app py-3.5 transition-colors active:bg-surface/70 hover:bg-surface/60 max-lg:min-h-[80px] max-lg:gap-4 max-lg:py-4 lg:min-h-[68px] lg:py-3",
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
            className="grid h-12 w-12 place-items-center rounded-full text-s font-semibold text-white max-lg:h-[52px] max-lg:w-[52px] lg:h-11 lg:w-11 lg:text-s"
            style={{ background: thread.avatar }}
            aria-hidden
          >
            {thread.initials}
          </div>
        )}
        {isOnline && (
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-s font-medium leading-tight",
              thread.unread > 0 && !active && "font-semibold text-foreground",
              thread.inactive && "text-muted-foreground",
            )}
          >
            {thread.name}
          </span>
          {thread.kind === "client" && !thread.inactive && (
            <StatusBadge config={outlineBadge("Client", "text-orange", "border-orange/30")} className="uppercase tracking-wide" />
          )}
          {thread.inactive && (
            <StatusBadge config={outlineBadge("Inactive", "text-muted-foreground", "border-border")} className="uppercase tracking-wide" />
          )}
          <span
            className={cn(
              "ms-auto shrink-0 text-xs leading-none",
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
              "min-w-0 flex-1 truncate text-s leading-snug max-lg:text-s",
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
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-none text-primary-foreground">
              {thread.unread > 9 ? "9+" : thread.unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
