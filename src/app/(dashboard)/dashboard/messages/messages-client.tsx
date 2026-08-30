"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  MessageSquare,
  Archive,
  Folder,
  Handshake,
  Star,
  PenSquare,
  MoreVertical,
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
import { usePresence } from "@/components/realtime/hooks";
import { globalPresenceChannel } from "@/lib/channels";
import { useNotificationStore } from "@/store/notifications";
import { PageName } from "@/components/page-header";
import { AccountMenuItems, SignOutDialog } from "@/components/user-menu";
import { ProfileDialog } from "@/components/profile-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewMessageDialog } from "./new-message-dialog";
import {
  ImportantMessageRow,
  ThreadGroup,
  ThreadRow,
} from "./inbox-rows";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
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

  useLayoutEffect(() => {
    if (searchOpen) searchInputRef.current?.focus({ preventScroll: true });
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

  // Pinned above every group, so it never scrolls away behind newer chatter.
  const announcementsRow = useMemo(
    () => allRows.find((t) => t.kind === "announcements") ?? null,
    [allRows],
  );
  // Inactive projects collapse into their own section (like Falak's archived).
  const rows = useMemo(
    () => allRows.filter((t) => !t.inactive && t.kind !== "announcements"),
    [allRows],
  );
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
        className="absolute inset-x-0 top-0 z-20 flex app-top-bar-tall app-top-bar-solid flex-col items-stretch gap-0 border-b border-border/60 pb-3.5"
      >
        <div className="flex items-center gap-s">
          <div className="flex min-w-0 flex-1 items-center gap-s">
            {!isClient && (
              <>
                <PageName>Inbox</PageName>
              </>
            )}
            {isClient && (
              <span className="page-name min-w-0 truncate text-foreground">Chats</span>
            )}
          </div>
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
          {isClient && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account"
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-9"
              >
                <MoreVertical className="h-5 w-5 lg:h-4 lg:w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <AccountMenuItems
                  profileLabel={null}
                  onProfile={() => setProfileOpen(true)}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
            autoFocus={searchOpen}
            inputMode="search"
            enterKeyHint="search"
            className="h-10 rounded-full border-0 bg-muted ps-10 text-[16px] shadow-none md:text-s lg:h-9"
          />
        </div>
        <OverflowTabBar
          className="mt-2.5"
          items={isClient ? CLIENT_INBOX_TABS : INBOX_TABS}
          value={tab}
          onChange={setTab}
          justify="start"
        />
      </div>

      {/* Bottom padding clears the mobile bottom navigation bar. */}
      <ul
        data-scroll-lock-root
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-manipulation",
          isClient
            ? "max-lg:pb-[env(safe-area-inset-bottom)]"
            : "max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]",
        )}
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
        {announcementsRow && (
          <li key={announcementsRow.id}>
            <ThreadRow
              thread={announcementsRow}
              active={pathname === `/dashboard/messages/${announcementsRow.id}`}
              isOnline={false}
              currentMemberId={currentMemberId}
            />
          </li>
        )}
        {rows.length === 0 && !showInactiveSection && !announcementsRow && (
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
                isClient={isClient}
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
      {isClient && (
        <>
          <ProfileDialog
            open={profileOpen}
            onOpenChange={setProfileOpen}
            onSignOut={() => {
              setProfileOpen(false);
              setSignOutOpen(true);
            }}
          />
          <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
        </>
      )}
    </aside>
  );
}
