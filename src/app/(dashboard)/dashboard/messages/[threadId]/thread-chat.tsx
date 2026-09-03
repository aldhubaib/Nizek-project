"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, Fragment } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Paperclip,
  Send,
  X,
  FileText,
  Loader2,
  UploadCloud,
  Search,
  Files as FilesIcon,
  Mic,
  Pause,
  Play,
  MoreVertical,
  ScrollText,
  Reply,
  Copy,
  Trash2,
  CheckSquare,
  Users,
  Bell,
  BellOff,
  Pencil,
  Camera,
  Image as ImageIcon,
  Star,
  ChevronUp,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
} from "@/components/ui/popover";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { AccountMenuItems, SignOutDialog } from "@/components/user-menu";
import { ProfileDialog } from "@/components/profile-dialog";
import { ClientAgreementDialog } from "@/components/client-agreement-dialog";
import {
  mountThreadProjectOverlay,
  unmountThreadProjectOverlay,
} from "@/components/messages/thread-project-overlay";
import { cn } from "@/lib/utils";
import { ClientChatPeopleManager } from "@/components/messages/client-chat-people";
import {
  toggleReaction,
  deleteMessage as deleteMessageAction,
  editMessage,
  getThreadMessages,
  getProjectTaskRefs,
  toggleImportantMessage,
  listImportantMessages,
  type MessageAttachment,
  type ReactionSummary,
  type TaskPickerItem,
  type ImportantMessageDTO,
} from "@/actions/messages";
import {
  CreateTaskFromMessageDialog,
  type CreateTaskFromMessagePayload,
} from "@/components/messages/create-task-from-message";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import { usePasteFiles } from "@/hooks/use-paste-files";
import {
  isThreadMuted,
  setThreadMuted,
} from "@/actions/notification-preferences";
import { usePresence, useTyping } from "@/components/realtime/hooks";
import {
  Lightbox,
  useLightbox,
  FilesPanel,
} from "@/components/messages/chat-attachments";
import { LinkPreviewCard } from "@/components/messages/link-preview";
import { ReplyContext } from "@/components/messages/reply-context";
import { firstUrl } from "@/lib/link-preview";
import {
  enqueueOutboxMessage,
  retryOutboxEntry,
  discardOutboxEntry,
  useThreadOutbox,
} from "@/lib/message-outbox";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import {
} from "@/components/messages/activity-card";
import { NoteSlideOver } from "@/components/project/note-slide-over";

import { mergeThreadMessages } from "@/lib/merge-thread-messages";
import {
  peekThreadCache,
  putThreadCache,
  threadIdFromTarget,
} from "@/lib/thread-cache";
import { firstUnreadMessageId } from "@/lib/chat-unread";
import {
  ALL_MENTION_ID,
  ALL_MENTION_NAME,
  ALL_MENTION_TEXT_RE,
  ALL_MENTION_TOKEN,
} from "@/lib/mentions";
import {
  fmtTaskNumber,
  isFeedMessage,
  renderComposerHighlight,
  sameDay,
  type ChatMessage,
  type PendingFile,
  type ThreadTarget,
} from "./thread-shared";

import { OutboxBubble } from "./outbox-bubble";
import { MessageRow, UnreadSeparator } from "./message-row";
import { VoiceVisualizer } from "./voice-visualizer";
import { useVoiceRecorder } from "./use-voice-recorder";
import { useThreadRealtime } from "./use-thread-realtime";
import { useThreadSearch } from "./use-thread-search";
import { ImageActionsMenu } from "./message-actions";

export type { ChatMessage, ThreadTarget } from "./thread-shared";

/** Floor on the load-older spinner so the transition is legible. */
const MIN_LOAD_MS = 450;

type ThreadPanel = "chat" | "files" | "important" | "project";
type ProjectPanelTab = "dashboard" | "roadmap";

function parseThreadPanel(value: string | null | undefined): ThreadPanel {
  if (value === "roadmap" || value === "project") return "project";
  if (value === "files" || value === "important") return value;
  return "chat";
}

function parseProjectTab(
  value: string | null | undefined,
  panel?: string | null,
): ProjectPanelTab {
  if (panel === "roadmap" || value === "roadmap") return "roadmap";
  return "dashboard";
}

function panelFromLocation(projectId?: string | null): ThreadPanel {
  if (typeof window === "undefined") return "chat";
  const panel = parseThreadPanel(new URLSearchParams(window.location.search).get("panel"));
  if (panel === "project" && !projectId) return "chat";
  return panel;
}

function projectTabFromLocation(): ProjectPanelTab {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  return parseProjectTab(params.get("tab"), params.get("panel"));
}

/** Keep ?panel= in the bar without a Next navigation (that remounts the overlay). */
function syncThreadPanelUrl(view: ThreadPanel, projectTab: ProjectPanelTab) {
  if (typeof window === "undefined") return;
  const next = new URLSearchParams(window.location.search);
  const wantPanel = view === "chat" ? null : view;
  const wantTab = view === "project" && projectTab === "roadmap" ? "roadmap" : null;
  if (next.get("panel") === wantPanel && next.get("tab") === wantTab) return;
  if (wantPanel) next.set("panel", wantPanel);
  else next.delete("panel");
  if (wantTab) next.set("tab", wantTab);
  else next.delete("tab");
  const qs = next.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
  );
}


export function ThreadChat({
  channel,
  presenceChannel,
  target,
  title,
  subtitle,
  currentMemberId,
  messages: initialMessages,
  hasMoreOlder = false,
  memberNames = {},
  peerMemberIds = [],
  mentionables = [],
  inactive = false,
  readOnly = false,
  replyOnly = false,
  canCreateTask = false,
  allowedTaskTypes = [],
  activeContractType = null,
  projectName,
  peerLastReadAt: initialPeerLastReadAt = null,
  lastReadAt: initialLastReadAt = null,
  unreadCount: initialUnreadCount = 0,
  isClientRoom = false,
  isClientUser: clientUser = false,
  showInboxBack = true,
  focusMessageId,
  initialPanel,
  initialProjectTab,
}: {
  channel: string;
  presenceChannel: string | null;
  target: ThreadTarget;
  title: string;
  subtitle: string;
  currentMemberId: string;
  messages: ChatMessage[];
  hasMoreOlder?: boolean;
  memberNames?: Record<string, string>;
  peerMemberIds?: string[];
  /** People involved in this thread, offered by the @ mention autocomplete. */
  mentionables?: { id: string; name: string }[];
  inactive?: boolean;
  readOnly?: boolean;
  /** Announcements: reactions and replies only — no new top-level messages. */
  replyOnly?: boolean;
  canCreateTask?: boolean;
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
  projectName?: string;
  peerLastReadAt?: string | null;
  /** Viewer's last-read cursor at open — frozen for the unread separator. */
  lastReadAt?: string | null;
  unreadCount?: number;
  /** Isolated client-facing room — shows curated people manager. */
  isClientRoom?: boolean;
  /** Viewing as a CLIENT user — hide staff inbox chrome. */
  isClientUser?: boolean;
  /** Mobile back-to-list. Hidden when a client has only one chat. */
  showInboxBack?: boolean;
  /** Scroll to this message after open (inbox Important tab). */
  focusMessageId?: string;
  /** Restore a slide-over after refresh (`?panel=`). */
  initialPanel?: string | null;
  initialProjectTab?: string | null;
}) {
  const threadKey = threadIdFromTarget(target);
  const cached = threadKey ? peekThreadCache(threadKey) : null;
  const restoreFromCache = Boolean(
    cached &&
      Date.now() - cached.updatedAt < 30 * 60 * 1000 &&
      (cached.snapshot.messages.length > 0 || cached.scrollTop != null),
  );

  const frameRef = useVisualViewportFrame<HTMLDivElement>();
  const pickFilesRef = useRef<(files: FileList | File[] | null) => void>(() => {});
  usePasteFiles((files) => pickFilesRef.current(files), {
    ref: frameRef,
    capture: true,
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    restoreFromCache
      ? mergeThreadMessages(cached!.snapshot.messages, initialMessages)
      : initialMessages,
  );
  // The cached snapshot is the better source: it already accounts for pages the
  // user paged back through, and those reach further than the server's newest
  // page. OR-ing the server flag in here would resurrect "load older" on a
  // thread whose history is fully loaded.
  const [hasMore, setHasMore] = useState(
    restoreFromCache ? cached!.snapshot.hasMoreOlder : hasMoreOlder,
  );
  /** Latched once we know nothing older exists, so an RSC update can't undo it. */
  const reachedOldestRef = useRef(
    !(restoreFromCache ? cached!.snapshot.hasMoreOlder : hasMoreOlder),
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Synchronous mirror of loadingOlder — scroll events fire faster than state. */
  const loadingOlderRef = useRef(false);
  const openUnreadCount = restoreFromCache ? 0 : initialUnreadCount;
  const openLastReadAt = restoreFromCache
    ? cached!.snapshot.lastReadAt
    : initialLastReadAt;
  const seekingUnread = openUnreadCount > 0 && !focusMessageId;
  const skipAutoScrollRef = useRef(seekingUnread || restoreFromCache);
  const nearBottomRef = useRef(
    restoreFromCache ? cached!.nearBottom : !seekingUnread,
  );
  const didInitialPinRef = useRef(false);
  const unreadSeekLoadsRef = useRef(0);
  const [unreadSeekExhausted, setUnreadSeekExhausted] = useState(false);
  const [nearBottom, setNearBottom] = useState(
    restoreFromCache ? cached!.nearBottom : !seekingUnread,
  );
  const [newBelow, setNewBelow] = useState(0);
  const [draft, setDraft] = useState(() => {
    if (restoreFromCache && cached?.draft) return cached.draft;
    if (!threadKey) return "";
    try {
      return sessionStorage.getItem(`nizek-chat-draft:${threadKey}`) ?? "";
    } catch {
      return "";
    }
  });
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<ThreadPanel>(() => {
    const fromUrl = parseThreadPanel(initialPanel);
    if (fromUrl !== "chat") {
      if (fromUrl === "project" && !target.projectId) {
        return "chat";
      }
      return fromUrl;
    }
    return panelFromLocation(target.projectId);
  });
  const [projectTab, setProjectTab] = useState<ProjectPanelTab>(() => {
    if (parseProjectTab(initialProjectTab, initialPanel) === "roadmap") return "roadmap";
    return projectTabFromLocation();
  });

  useEffect(() => {
    syncThreadPanelUrl(view, projectTab);
  }, [view, projectTab]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [importantList, setImportantList] = useState<ImportantMessageDTO[]>([]);
  const [importantLoading, setImportantLoading] = useState(false);
  const pendingFocusRef = useRef<string | null>(focusMessageId ?? null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(
    initialPeerLastReadAt,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  /** Mobile WhatsApp-style selection — replaces the thread header with actions. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createTaskPayload, setCreateTaskPayload] =
    useState<CreateTaskFromMessagePayload | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Thread mute: server-stored, all devices. Muted threads produce no
  // notification row, push, or chime — the thread itself still updates live.
  // This thread's pending sends, held by the app-wide outbox manager.
  const outbox = useThreadOutbox(threadKey);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (!threadKey) return;
    isThreadMuted(threadKey).then(setMuted).catch(() => {});
  }, [threadKey]);
  const toggleMute = useCallback(() => {
    if (!threadKey) return;
    const next = !muted;
    setMuted(next);
    void setThreadMuted(threadKey, next).catch(() => setMuted(!next));
  }, [threadKey, muted]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollToMessage = useCallback((id: string, opts?: { flash?: boolean }) => {
    const scroller = scrollerRef.current;
    const el = document.getElementById(`msg-${id}`);
    if (!scroller || !el) return false;
    nearBottomRef.current = false;
    setNearBottom(false);
    skipAutoScrollRef.current = true;
    const sRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const top =
      eRect.top - sRect.top + scroller.scrollTop - (scroller.clientHeight - el.offsetHeight) / 2;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    if (opts?.flash !== false) {
      el.classList.remove("message-flash");
      // Reflow, so re-targeting the same message replays the animation.
      void el.offsetWidth;
      el.classList.add("message-flash");
      window.setTimeout(() => el.classList.remove("message-flash"), 1500);
    }
    return true;
  }, []);

  const {
    searchOpen,
    searchQuery,
    setSearchQuery,
    searchCursorId,
    searchInputRef,
    sq,
    searchMatches,
    searchMatchIndex,
    canGoOlder,
    canGoNewer,
    goSearchMatch,
    openSearch: openSearchPanel,
    closeSearch,
  } = useThreadSearch({ messages, scrollToMessage, pendingFocusRef });

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const closeThreadPanels = useCallback(() => {
    closeSearch();
    setPeopleOpen(false);
    setProjectTab("dashboard");
    setView("chat");
  }, [closeSearch]);

  useLayoutEffect(() => {
    if (view === "project" && target.projectId) {
      mountThreadProjectOverlay({
        projectId: target.projectId,
        tab: projectTab,
        onTabChange: setProjectTab,
        onClose: closeThreadPanels,
        instant: initialPanel === "project",
        router,
        pathname,
        searchParams,
      });
    } else {
      unmountThreadProjectOverlay();
    }
    return () => unmountThreadProjectOverlay();
  }, [
    view,
    projectTab,
    target.projectId,
    closeThreadPanels,
    initialPanel,
    router,
    pathname,
    searchParams,
  ]);
  const openSearch = useCallback(() => {
    if (searchOpen) {
      closeThreadPanels();
      return;
    }
    setPeopleOpen(false);
    setView("chat");
    openSearchPanel();
  }, [searchOpen, closeThreadPanels, openSearchPanel]);
  const openThreadPanel = useCallback(
    (panel: "files" | "important" | "people" | "project") => {
      const already =
        (panel === "people" && peopleOpen) || (panel !== "people" && view === panel);
      if (already) {
        closeThreadPanels();
        return;
      }
      closeSearch();
      setPeopleOpen(panel === "people");
      setView(panel === "people" ? "chat" : panel);
    },
    [peopleOpen, view, closeThreadPanels, closeSearch],
  );
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // URL the composer preview was dismissed for (X) — hides it until it changes.
  const [dismissedPreview, setDismissedPreview] = useState<string | null>(null);
  // "#" task references (project channels only).
  const isProjectChannel =
    !!target.projectId && !target.taskId && !target.conversationId;
  const [taskRefs, setTaskRefs] = useState<TaskPickerItem[] | null>(null);
  const [pendingTaskRef, setPendingTaskRef] = useState<TaskPickerItem | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const lb = useLightbox();

  const online = usePresence(presenceChannel);
  const { typing, notifyTyping } = useTyping(channel);

  // Adjust state when the server-provided messages change (thread switch / RSC
  // update) during render instead of in an effect — avoids the extra commit +
  // re-render cascade the effect version triggered. Uses the React-sanctioned
  // "store previous prop in state" pattern.
  const [prevInitial, setPrevInitial] = useState(initialMessages);
  if (prevInitial !== initialMessages) {
    setPrevInitial(initialMessages);
    setMessages(mergeThreadMessages(messages, initialMessages));
    setHasMore(!reachedOldestRef.current && (hasMore || hasMoreOlder));
  }

  const [prevPeerRead, setPrevPeerRead] = useState(initialPeerLastReadAt);
  if (prevPeerRead !== initialPeerLastReadAt) {
    setPrevPeerRead(initialPeerLastReadAt);
    setPeerLastReadAt(initialPeerLastReadAt);
  }

  // Restore composer draft for this thread from sessionStorage.
  useEffect(() => {
    setReplyTo(null);
    if (!threadKey) return;
    try {
      const saved = sessionStorage.getItem(`nizek-chat-draft:${threadKey}`);
      if (saved) setDraft(saved);
    } catch {
      /* private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  // Persist draft (debounced).
  useEffect(() => {
    if (!threadKey) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        const key = `nizek-chat-draft:${threadKey}`;
        if (draft.trim()) sessionStorage.setItem(key, draft);
        else sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [draft, threadKey]);

  const cacheSnapshot = {
    channel,
    presenceChannel,
    target,
    title,
    subtitle,
    currentMemberId,
    messages,
    hasMoreOlder: hasMore,
    memberNames,
    peerMemberIds,
    mentionables,
    inactive,
    readOnly,
    canCreateTask,
    allowedTaskTypes,
    activeContractType,
    projectName,
    peerLastReadAt,
    lastReadAt: openLastReadAt,
    unreadCount: openUnreadCount,
    isClientRoom,
  };
  const cacheSnapshotRef = useRef(cacheSnapshot);
  cacheSnapshotRef.current = cacheSnapshot;

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!threadKey) return;
    putThreadCache(threadKey, {
      snapshot: cacheSnapshotRef.current,
      draft,
      nearBottom: nearBottomRef.current,
      scrollTop: scrollerRef.current?.scrollTop ?? null,
      opened: true,
    });
  }, [threadKey, messages, draft, hasMore, title, subtitle]);

  useEffect(() => {
    if (!threadKey) return;
    return () => {
      putThreadCache(threadKey, {
        snapshot: cacheSnapshotRef.current,
        nearBottom: nearBottomRef.current,
        scrollTop: scrollerRef.current?.scrollTop ?? null,
        opened: true,
      });
    };
  }, [threadKey]);

  // Fetch the previous page (older messages) and prepend it, keeping the
  // viewport anchored so the list doesn't jump.
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore || messages.length === 0) return;
    const startedAt = Date.now();
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await getThreadMessages({
        ...target,
        cursorId: messages[0].id,
      });
      // A cached page can resolve in a few ms, which would make the spinner
      // flash rather than read as loading.
      const remaining = MIN_LOAD_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      // Measured after the wait so a message arriving meanwhile is accounted for.
      const el = scrollerRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      const prevTop = el?.scrollTop ?? 0;
      skipAutoScrollRef.current = true;
      // Realtime only ever appends newer messages, so counting against the
      // rendered list is accurate for the older end.
      const held = new Set(messages.map((m) => m.id));
      const added = page.messages.filter((m) => !held.has(m.id)).length;
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const older = page.messages.filter((m) => !existing.has(m.id));
        return [...older, ...prev];
      });
      // A page that adds nothing means the cursor can't move any further back —
      // treat that as the end rather than leaving a button that does nothing.
      const more = page.hasMore && added > 0;
      reachedOldestRef.current = !more;
      setHasMore(more);
      requestAnimationFrame(() => {
        const scroller = scrollerRef.current;
        if (scroller) {
          scroller.scrollTop = scroller.scrollHeight - prevHeight + prevTop;
        }
      });
    } catch {
      // Best-effort — the button stays available for a retry.
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, messages, target.taskId, target.projectId, target.conversationId]);

  // Free preview object URLs if the user leaves the thread without sending.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    },
    [],
  );

  useThreadRealtime({
    channel,
    target,
    threadKey,
    currentMemberId,
    setMessages,
    setNewBelow,
    setPeerLastReadAt,
    nearBottomRef,
  });


  // Track whether the user is near the bottom of the scroller.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = dist < 120;
      nearBottomRef.current = near;
      setNearBottom(near);
      if (near) setNewBelow(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Prepending older pages must not yank the user to the bottom.
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    // Stay put while we jump to an Important / ?msg= target or unread line.
    if (pendingFocusRef.current) return;
    if (!didInitialPinRef.current) return;
    if (!nearBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, typing.length, outbox.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    const inner = el?.firstElementChild;
    if (!el || !(inner instanceof HTMLElement)) return;
    const ro = new ResizeObserver(() => {
      if (!nearBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const firstUnreadId = useMemo(
    () =>
      openUnreadCount > 0
        ? firstUnreadMessageId(messages, currentMemberId, openLastReadAt)
        : null,
    [messages, currentMemberId, openLastReadAt, openUnreadCount],
  );

  const crossedReadBoundary = useMemo(() => {
    if (openUnreadCount <= 0) return true;
    if (messages.length === 0) return !hasMore;
    if (!openLastReadAt) return !hasMore;
    const t = new Date(openLastReadAt).getTime();
    return messages.some((m) => new Date(m.createdAt).getTime() <= t) || !hasMore;
  }, [messages, openLastReadAt, openUnreadCount, hasMore]);

  const readyForUnreadLine =
    !focusMessageId &&
    openUnreadCount > 0 &&
    Boolean(firstUnreadId) &&
    (crossedReadBoundary || unreadSeekExhausted);

  const pinScroller = useCallback((mode: "bottom" | "unread") => {
    const el = scrollerRef.current;
    if (!el) return false;
    if (mode === "unread") {
      const sep = document.getElementById("unread-separator");
      if (!sep) return false;
      const sRect = el.getBoundingClientRect();
      const eRect = sep.getBoundingClientRect();
      el.scrollTop = Math.max(0, eRect.top - sRect.top + el.scrollTop - 8);
      nearBottomRef.current = false;
      setNearBottom(false);
      skipAutoScrollRef.current = true;
      return true;
    }
    el.scrollTop = el.scrollHeight;
    nearBottomRef.current = true;
    setNearBottom(true);
    return true;
  }, []);

  const finishOpen = useCallback(
    (mode: "bottom" | "unread") => {
      if (didInitialPinRef.current) return;
      if (!pinScroller(mode)) return;
      didInitialPinRef.current = true;
    },
    [pinScroller],
  );

  useLayoutEffect(() => {
    if (didInitialPinRef.current) return;
    if (pendingFocusRef.current) return;
    if (restoreFromCache && scrollerRef.current) {
      const el = scrollerRef.current;
      if (typeof cached?.scrollTop === "number") {
        el.scrollTop = cached.scrollTop;
      }
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const pinBottom =
        cached?.nearBottom || dist < Math.max(400, el.clientHeight * 1.2);
      if (pinBottom) {
        el.scrollTop = el.scrollHeight;
        nearBottomRef.current = true;
        setNearBottom(true);
      } else {
        nearBottomRef.current = false;
        setNearBottom(false);
      }
      didInitialPinRef.current = true;
      skipAutoScrollRef.current = true;
      return;
    }
    if (openUnreadCount > 0) {
      if (readyForUnreadLine) {
        finishOpen("unread");
        return;
      }
      if (crossedReadBoundary && !firstUnreadId) {
        finishOpen("bottom");
      }
      return;
    }
    finishOpen("bottom");
  }, [messages.length, firstUnreadId, crossedReadBoundary, readyForUnreadLine, openUnreadCount, finishOpen, restoreFromCache, cached]);

  useEffect(() => {
    if (didInitialPinRef.current) return;
    if (pendingFocusRef.current) return;
    if (openUnreadCount <= 0) return;
    if (crossedReadBoundary) return;
    if (hasMore && !loadingOlder && unreadSeekLoadsRef.current < 10) {
      unreadSeekLoadsRef.current += 1;
      skipAutoScrollRef.current = true;
      void loadOlder();
      return;
    }
    if (!loadingOlder) {
      setUnreadSeekExhausted(true);
    }
  }, [
    crossedReadBoundary,
    firstUnreadId,
    hasMore,
    loadingOlder,
    loadOlder,
    openUnreadCount,
    finishOpen,
  ]);


  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const pin = () => {
      el.scrollTop = el.scrollHeight;
    };
    pin();
    // Outbox bubble / composer collapse land on the next frame.
    requestAnimationFrame(() => {
      pin();
      requestAnimationFrame(pin);
    });
    setNewBelow(0);
    nearBottomRef.current = true;
    setNearBottom(true);
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const peopleNames = useMemo(() => {
    const map: Record<string, string> = { ...memberNames };
    for (const m of messages) {
      if (m.authorId && m.authorName && !map[m.authorId]) {
        map[m.authorId] = m.authorName;
      }
    }
    return map;
  }, [memberNames, messages]);

  // Detect a trailing "#query" token in the draft — opens the task picker.
  const taskToken = useMemo(() => {
    if (!isProjectChannel) return null;
    const m = /(^|\s)#([^\s#]*)$/.exec(draft);
    if (!m) return null;
    return { start: m.index + m[1].length, query: m[2].toLowerCase() };
  }, [draft, isProjectChannel]);

  // Load the project's tasks the first time the member types "#".
  useEffect(() => {
    if (!taskToken || taskRefs || !target.projectId) return;
    getProjectTaskRefs(target.projectId)
      .then(setTaskRefs)
      .catch(() => setTaskRefs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskToken, taskRefs, target.projectId]);

  const pickerResults = useMemo(() => {
    if (!taskToken || !taskRefs) return [];
    const q = taskToken.query;
    const filtered = q
      ? taskRefs.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            fmtTaskNumber(t.number).toLowerCase().includes(q) ||
            String(t.number).includes(q),
        )
      : taskRefs;
    return filtered.slice(0, 6);
  }, [taskToken, taskRefs]);
  const pickerOpen = !!taskToken && pickerResults.length > 0;

  useEffect(() => {
    setPickerIndex(0);
  }, [taskToken?.query, pickerResults.length]);

  const pickTask = (t: TaskPickerItem) => {
    if (!taskToken) return;
    const label = `#${fmtTaskNumber(t.number)}`;
    const before = draft.slice(0, taskToken.start);
    const after = draft.slice(taskToken.start + 1 + taskToken.query.length);
    setDraft(`${before}${label} ${after}`.replace(/ {2,}/g, " "));
    setPendingTaskRef(t);
    setTimeout(() => composerRef.current?.focus(), 0);
  };

  // Detect a trailing "@query" token in the draft — opens the member picker.
  // Mentions display as plain "@Name" while typing; on send each picked name
  // becomes the "@[Name](userId)" token that sendMessage parses to notify them.
  const canMentionAll = !!target.projectId;
  const mentionToken = useMemo(() => {
    if (mentionables.length === 0 && !canMentionAll) return null;
    const m = /(^|\s)@([^\s@]*)$/.exec(draft);
    if (!m) return null;
    return { start: m.index + m[1].length, query: m[2].toLowerCase() };
  }, [draft, mentionables.length, canMentionAll]);

  const mentionResults = useMemo(() => {
    if (!mentionToken) return [];
    const q = mentionToken.query;
    const results: { id: string; name: string; isAll?: boolean }[] = [];
    if (canMentionAll && (!q || ALL_MENTION_NAME.startsWith(q))) {
      results.push({ id: ALL_MENTION_ID, name: ALL_MENTION_NAME, isAll: true });
    }
    const people = q
      ? mentionables.filter((m) => m.name.toLowerCase().includes(q))
      : mentionables;
    for (const m of people) {
      if (results.length >= 6) break;
      results.push(m);
    }
    return results;
  }, [mentionToken, mentionables, canMentionAll]);
  const mentionPickerOpen = !!mentionToken && mentionResults.length > 0;
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionToken?.query, mentionResults.length]);

  const pickMention = (m: { id: string; name: string }) => {
    if (!mentionToken) return;
    const before = draft.slice(0, mentionToken.start);
    const after = draft.slice(mentionToken.start + 1 + mentionToken.query.length);
    const label = m.id === ALL_MENTION_ID ? ALL_MENTION_NAME : m.name;
    setDraft(`${before}@${label} ${after}`.replace(/ {2,}/g, " "));
    setTimeout(() => composerRef.current?.focus(), 0);
  };

  const composerMentionNames = useMemo(() => {
    const names = mentionables.map((m) => m.name);
    if (canMentionAll) names.push(ALL_MENTION_NAME);
    return names;
  }, [mentionables, canMentionAll]);

  // Files wait locally (no upload) until the user presses Send.
  const pickFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files).filter((f) => f.size > 0);
    const tooBig = all.filter((f) => f.size > MAX_UPLOAD_BYTES);
    setFileError(
      tooBig.length > 0
        ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over the ${MAX_UPLOAD_LABEL} limit and won't be attached.`
        : null,
    );
    const picked: PendingFile[] = all
      .filter((f) => f.size <= MAX_UPLOAD_BYTES)
      .map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      }));
    setPending((prev) => [...prev, ...picked]);
  };
  pickFilesRef.current = pickFiles;

  const removePending = (key: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    pickFiles(e.dataTransfer.files);
  };

  const send = () => {
    let text = draft.trim();
    if (!text && pending.length === 0) return;
    if (!threadKey) return;
    // Convert @all first, then any "@Full Name" that matches a project member.
    text = text.replace(ALL_MENTION_TEXT_RE, ALL_MENTION_TOKEN);
    const sortedMentions = [...mentionables].sort(
      (a, b) => b.name.length - a.name.length,
    );
    for (const m of sortedMentions) {
      text = text.split(`@${m.name}`).join(`@[${m.name}](${m.id})`);
    }
    const files = [...pending];
    const replyId = replyTo;
    const taskRefId = pendingTaskRef?.id ?? null;
    setDraft("");
    setPending([]);
    setReplyTo(null);
    setPendingTaskRef(null);
    setDismissedPreview(null);
    try {
      sessionStorage.removeItem(`nizek-chat-draft:${threadKey}`);
    } catch {
      /* ignore */
    }

    // The app-wide outbox uploads and delivers this even if the user leaves
    // the thread; this component only renders the entry's progress bubble.
    enqueueOutboxMessage({
      threadKey,
      target,
      body: text,
      replyToId: replyId,
      taskRefId,
      files: files.map((f) => ({
        key: f.key,
        file: f.file,
        previewUrl: f.previewUrl,
      })),
    });
    scrollToBottom();
  };

  // Send a finished recording through the normal attachment pipeline.
  const sendVoice = useCallback(
    (file: File) => {
      if (!threadKey) return;
      const replyId = replyTo;
      setReplyTo(null);
      enqueueOutboxMessage({
        threadKey,
        target,
        body: "",
        replyToId: replyId,
        files: [{ key: `voice-${Date.now()}`, file, previewUrl: null }],
      });
      scrollToBottom();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replyTo, threadKey, target.taskId, target.projectId, target.conversationId, scrollToBottom],
  );

  const {
    recording,
    recordPaused,
    recordSecs,
    recordError,
    holdRecording,
    slideCancelArmed,
    analyserRef,
    recordPausedRef,
    stopRecording,
    togglePauseRecording,
    onMicPointerDown,
  } = useVoiceRecorder({ onSend: sendVoice });

  const react = useCallback(
    (messageId: string, emoji: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          let reactions: ReactionSummary[];
          if (existing) {
            const mine = existing.memberIds.includes(currentMemberId);
            const memberIds = mine
              ? existing.memberIds.filter((id) => id !== currentMemberId)
              : [...existing.memberIds, currentMemberId];
            reactions = memberIds.length
              ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, memberIds } : r))
              : m.reactions.filter((r) => r.emoji !== emoji);
          } else {
            reactions = [...m.reactions, { emoji, memberIds: [currentMemberId] }];
          }
          return { ...m, reactions };
        }),
      );
      startTransition(async () => {
        await toggleReaction(messageId, emoji);
      });
    },
    [currentMemberId],
  );

  const clearSelection = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const handleReply = useCallback((id: string) => {
    setSelectedId(null);
    setReplyTo(id);
    setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setSelectedId(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSelectedId(null);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      await deleteMessageAction(id);
    });
  }, []);

  // Reads through a ref so the callback identity stays stable — depending on
  // `messages` here re-renders every memoized MessageRow on each new message.
  const handleEdit = useCallback((id: string) => {
    const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) return;
      setSelectedId(null);
      setEditingId(id);
      setEditDraft(msg.body);
  }, []);

  const onSaveEdit = useCallback(() => {
    if (!editingId) return;
    const id = editingId;
    const body = editDraft.trim();
    if (!body) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, body, edited: true, updatedAt: new Date().toISOString() }
          : m,
      ),
    );
    setEditingId(null);
    setEditDraft("");
    startTransition(async () => {
      const res = await editMessage(id, body);
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  body: res.data.body,
                  updatedAt: res.data.updatedAt,
                  edited: true,
                }
              : m,
          ),
        );
      }
    });
  }, [editingId, editDraft]);

  const onCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  const handleCreateTask = useCallback(
    (m: ChatMessage) => {
      if (!canCreateTask || !target.projectId || inactive) return;
      const selection = window.getSelection()?.toString()?.trim() ?? "";
      const msgEl = document.getElementById(`msg-${m.id}`);
      const selectionInMessage =
        selection &&
        msgEl &&
        window.getSelection()?.anchorNode &&
        msgEl.contains(window.getSelection()!.anchorNode);
      const titleSource = selectionInMessage
        ? selection
        : (m.body.split("\n").find((l) => l.trim()) ?? m.body).trim();
      const title =
        titleSource.length > 120
          ? `${titleSource.slice(0, 120)}…`
          : titleSource || "New task";
      const threadPath = target.taskId
        ? `/dashboard/projects/${target.projectId}/tasks/${target.taskId}`
        : `/dashboard/messages/project-${target.projectId}`;
      setSelectedId(null);
      setCreateTaskPayload({
        projectId: target.projectId,
        projectName: projectName ?? title,
        allowedTaskTypes,
        activeContractType: activeContractType ?? "",
        title,
        description: m.body,
        sourceAuthor: m.authorName,
        threadPath,
      });
    },
    [
      canCreateTask,
      target.projectId,
      target.taskId,
      inactive,
      projectName,
      allowedTaskTypes,
      activeContractType,
      title,
    ],
  );

  const handleToggleImportant = useCallback((id: string) => {
    setSelectedId(null);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, important: !m.important } : m)),
    );
    startTransition(async () => {
      const res = await toggleImportantMessage(id);
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, important: !m.important } : m,
          ),
        );
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, important: res.important } : m,
        ),
      );
      try {
        const rows = await listImportantMessages({
          taskId: target.taskId,
          projectId: target.projectId,
          conversationId: target.conversationId,
        });
        setImportantList(rows);
      } catch {
        // Overlay refetches the next time it opens.
      }
    });
  }, [target.taskId, target.projectId, target.conversationId]);

  const selectedMessage = useMemo(
    () => (selectedId ? messages.find((m) => m.id === selectedId) ?? null : null),
    [selectedId, messages],
  );
  const selectedMine =
    selectedMessage != null && selectedMessage.authorId === currentMemberId;

  const peersOnline = peerMemberIds.some((id) => online.has(id));
  const typingLabel = useMemo(() => {
    const names = typing.map((id) => memberNames[id] ?? "Someone");
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return "Several people are typing…";
  }, [typing, memberNames]);

  const jumpToMessage = useCallback((id: string) => {
    closeThreadPanels();
    pendingFocusRef.current = id;
    nearBottomRef.current = false;
    skipAutoScrollRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pendingFocusRef.current !== id) return;
        if (scrollToMessage(id)) pendingFocusRef.current = null;
      });
    });
  }, [scrollToMessage, closeThreadPanels]);

  useEffect(() => {
    if (focusMessageId) pendingFocusRef.current = focusMessageId;
  }, [focusMessageId]);

  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    if (document.getElementById(`msg-${id}`)) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (pendingFocusRef.current !== id) return;
          if (scrollToMessage(id)) pendingFocusRef.current = null;
        });
      });
      return;
    }
    if (hasMore && !loadingOlder) {
      void loadOlder();
      return;
    }
    if (!loadingOlder && !hasMore) pendingFocusRef.current = null;
  }, [messages, hasMore, loadingOlder, loadOlder, scrollToMessage]);

  useEffect(() => {
    if (view !== "important") return;
    let cancelled = false;
    setImportantLoading(true);
    listImportantMessages({
      taskId: target.taskId,
      projectId: target.projectId,
      conversationId: target.conversationId,
    })
      .then((rows) => {
        if (!cancelled) setImportantList(rows);
      })
      .catch(() => {
        if (!cancelled) setImportantList([]);
      })
      .finally(() => {
        if (!cancelled) setImportantLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, target.taskId, target.projectId, target.conversationId]);

  const allImages = useMemo(
    () => messages.flatMap((m) => m.attachments.filter((a) => a.isImage)),
    [messages],
  );

  const msgByAttachmentId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) for (const a of m.attachments) map.set(a.id, m);
    return map;
  }, [messages]);

  const openImage = useCallback(
    (att: MessageAttachment) => lb.open(att, allImages),
    [lb, allImages],
  );

  const replyingTo = replyTo ? byId.get(replyTo) : null;


  // First link in the draft — previewed above the composer until dismissed.
  const composerUrl = useMemo(() => {
    const u = firstUrl(draft);
    return u && u !== dismissedPreview ? u : null;
  }, [draft, dismissedPreview]);

  return (
    <div
      ref={frameRef}
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden touch-manipulation"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-surface/80 px-10 py-8 text-primary">
            <UploadCloud className="h-8 w-8" />
            <span className="text-s font-semibold">Drop files to upload</span>
          </div>
        </div>
      )}

      {/* Thread header — swaps to WhatsApp-style selection toolbar on mobile. */}
      {selectedMessage ? (
        <div className="flex shrink-0 app-top-bar-tall app-top-bar-solid items-center gap-0.5 border-b border-border/60 px-1 sm:px-2 lg:hidden">
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Cancel selection"
            className="grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[1.5rem] px-1 text-m font-semibold tabular-nums">
            1
          </span>
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => handleReply(selectedMessage.id)}
              aria-label="Reply"
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Reply className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => handleCopy(selectedMessage.body)}
              aria-label="Copy"
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Copy className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => handleToggleImportant(selectedMessage.id)}
              aria-label={
                selectedMessage.important
                  ? "Remove from important"
                  : "Mark as important"
              }
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <Star
                className={cn(
                  "h-5 w-5",
                  selectedMessage.important && "fill-orange text-orange",
                )}
              />
            </button>
            {canCreateTask && target.projectId && !inactive && (
              <button
                type="button"
                onClick={() => handleCreateTask(selectedMessage)}
                aria-label="Create task"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <CheckSquare className="h-5 w-5" />
              </button>
            )}
            {selectedMine && selectedMessage.kind !== "rejection" && (
              <button
                type="button"
                onClick={() => handleEdit(selectedMessage.id)}
                aria-label="Edit"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
            {selectedMine && (
              <button
                type="button"
                onClick={() => handleDelete(selectedMessage.id)}
                aria-label="Delete"
                className="grid size-11 place-items-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More actions"
                className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <MoreVertical className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1">
                <DropdownMenuItem
                  onClick={() => {
                    clearSelection();
                    openSearch();
                  }}
                  className="min-h-11 gap-3 text-s"
                >
                  <Search className="h-4 w-4" />
                  <span className="flex-1">Search in chat</span>
                </DropdownMenuItem>
                {canCreateTask && target.projectId && !inactive && (
                  <DropdownMenuItem
                    onClick={() => handleCreateTask(selectedMessage)}
                    className="min-h-11 gap-3 text-s"
                  >
                    <CheckSquare className="h-4 w-4" />
                    <span className="flex-1">Create task</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "flex shrink-0 app-top-bar-tall app-top-bar-solid items-center gap-2 border-b border-border/60 sm:gap-3",
          selectedMessage && "hidden lg:flex",
          !showInboxBack && !searchOpen && "ps-3",
          // The bar has no bottom padding of its own, so the search field —
          // taller than the title block it replaces — would sit on the divider.
          searchOpen && "pe-3 pb-3",
        )}
      >
        {searchOpen ? (
          <button
            type="button"
            onClick={closeThreadPanels}
            aria-label="Close search"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-8"
          >
            <ArrowLeft className="h-5 w-5 lg:h-4 lg:w-4" />
          </button>
        ) : showInboxBack ? (
        <Link
          href="/dashboard/messages"
          aria-label="Back to inbox"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-8"
        >
          <ArrowLeft className="h-5 w-5 lg:h-4 lg:w-4" />
        </Link>
        ) : null}
        <div className={cn("min-w-0 flex-1", searchOpen && "hidden")}>
          <div className="flex items-center gap-2">
            <PageBreadcrumb items={[{ label: title }]} />
            {muted && (
              <BellOff className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-label="Muted" />
            )}
            {peerMemberIds.length > 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs",
                  peersOnline ? "text-success" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    peersOnline ? "bg-success" : "bg-muted-foreground/50",
                  )}
                />
                {peersOnline ? "Online" : "Offline"}
              </span>
            )}
          </div>
          <div className="truncate text-s text-muted-foreground">{subtitle}</div>
        </div>
        <div
          className={cn(
            "relative min-w-0",
            searchOpen
              ? "flex-1"
              : "pointer-events-none absolute h-11 w-48 overflow-hidden opacity-0",
          )}
        >
          {searchOpen && searchQuery ? (
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              className="absolute left-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                closeThreadPanels();
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                goSearchMatch(-1);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                goSearchMatch(1);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                goSearchMatch(e.shiftKey ? 1 : -1);
              }
            }}
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search…"
            className={cn(
              "h-11 rounded-full border-0 bg-muted pl-9 text-[16px] shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-muted md:h-10 md:text-s",
              searchOpen ? "pr-[5.5rem]" : "pr-9",
            )}
          />
          {searchOpen && (
            <div className="absolute inset-y-0 right-1 flex items-center">
              <span className="sr-only" aria-live="polite">
                {!sq
                  ? ""
                  : searchMatches.length === 0
                    ? "No messages found"
                    : searchMatchIndex >= 0
                      ? `Match ${searchMatchIndex + 1} of ${searchMatches.length}`
                      : ""}
              </span>
              <button
                type="button"
                aria-label="Older match"
                disabled={!canGoOlder}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => goSearchMatch(-1)}
                className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Newer match"
                disabled={!canGoNewer}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => goSearchMatch(1)}
                className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {!searchOpen && (
          <>
        <button
          type="button"
          aria-label="Search"
          title="Search"
          onClick={openSearch}
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-8 lg:rounded-lg"
        >
          <Search className="h-5 w-5 lg:h-4 lg:w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More options"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:size-8"
          >
            <MoreVertical className="h-5 w-5 lg:h-4 lg:w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => openThreadPanel("files")}>
              <FilesIcon className="h-4 w-4" />
              <span className="flex-1">Media</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openThreadPanel("important")}>
              <Star className="h-4 w-4" />
              <span className="flex-1">Important</span>
            </DropdownMenuItem>
            {isClientRoom && target.projectId ? (
              <DropdownMenuItem onClick={() => openThreadPanel("people")}>
                <Users className="h-4 w-4" />
                <span className="flex-1">People</span>
              </DropdownMenuItem>
            ) : null}
            {clientUser && isClientRoom && target.projectId ? (
              <DropdownMenuItem onClick={() => openThreadPanel("project")}>
                <LayoutDashboard className="h-4 w-4" />
                <span className="flex-1">My project</span>
              </DropdownMenuItem>
            ) : null}
            {threadKey ? (
              <>
                <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleMute}>
                {muted ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
                <span className="flex-1">{muted ? "Unmute" : "Mute"}</span>
              </DropdownMenuItem>
              </>
            ) : null}
            {/* Clients have no sidebar, so their account lives here. */}
            {clientUser ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAgreementOpen(true)}>
                  <ScrollText className="h-4 w-4" />
                  <span className="flex-1">User agreement</span>
                </DropdownMenuItem>
                <AccountMenuItems
                  profileLabel={null}
                  onProfile={() => setProfileOpen(true)}
                />
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
          </>
        )}
      </div>
      {clientUser && (
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
          <ClientAgreementDialog
            open={agreementOpen}
            onOpenChange={setAgreementOpen}
          />
        </>
      )}

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollerRef}
          data-scroll-lock-root
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-app pt-2 lg:px-8"
        >
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-xs">
            {/* Sits above the oldest message, so it only comes into view once
                the user has scrolled the whole loaded history. */}
            {hasMore && (
              <div className="flex shrink-0 justify-center py-3">
                <button
                  type="button"
                  data-load-older-pill="1"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="flex animate-in items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-s font-medium text-primary-foreground shadow-sm duration-200 fade-in transition-colors hover:bg-primary/90 disabled:opacity-100"
                >
                  {loadingOlder && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {loadingOlder ? "Loading older messages…" : "Load older messages"}
                </button>
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              const isFeed = isFeedMessage(m);
              const prevFeed = prev ? isFeedMessage(prev) : false;
              const newGroup =
                !prev ||
                prev.authorId !== m.authorId ||
                showDay ||
                isFeed ||
                prevFeed;
              const mine = isFeed ? false : m.authorId === currentMemberId;
              return (
                <Fragment key={m.id}>
                  {m.id === firstUnreadId && readyForUnreadLine ? (
                    <UnreadSeparator count={openUnreadCount} />
                  ) : null}
                  <MessageRow
                  m={m}
                  mine={mine}
                  showDay={showDay}
                  newGroup={newGroup}
                  showAuthor={!mine && newGroup}
                  notFirst={i > 0}
                  dimmed={false}
                  replied={m.replyToId ? byId.get(m.replyToId) : null}
                  showTaskCard={!target.taskId}
                  currentMemberId={currentMemberId}
                  peerLastReadAt={peerLastReadAt}
                  canCreateTask={
                    canCreateTask && !!target.projectId && !inactive
                  }
                  selected={selectedId === m.id}
                  onSelect={setSelectedId}
                  editing={editingId === m.id}
                  editDraft={editingId === m.id ? editDraft : ""}
                  react={react}
                  handleReply={handleReply}
                  handleCopy={handleCopy}
                  handleDelete={handleDelete}
                  handleEdit={handleEdit}
                  handleCreateTask={handleCreateTask}
                  handleToggleImportant={handleToggleImportant}
                  onEditDraftChange={setEditDraft}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  scrollToMessage={jumpToMessage}
                  openImage={openImage}
                  memberNames={peopleNames}
                  searchQuery={sq || undefined}
                  searchCurrent={searchCursorId === m.id}
                  projectName={projectName}
                />
                </Fragment>
              );
            })}
            {outbox.map((o) => (
              <OutboxBubble
                key={o.tempId}
                entry={o}
                replied={o.replyToId ? byId.get(o.replyToId) : null}
                currentMemberId={currentMemberId}
                onRetry={retryOutboxEntry}
                onDiscard={discardOutboxEntry}
              />
            ))}
            {messages.length === 0 && outbox.length === 0 && (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <div className="text-s font-medium text-foreground">
                  No messages yet
                </div>
                <p className="text-s text-muted-foreground">
                  Send a message to start the conversation.
                </p>
              </div>
            )}
            {typingLabel && (
              <div className="flex items-end gap-2">
                <div className="w-8 shrink-0" />
                <div className="flex flex-col gap-1">
                  <div className="rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5">
                    <div className="flex items-center gap-1" aria-label={typingLabel}>
                      <span className="size-1.5 animate-[typing_1.4s_ease-in-out_infinite] rounded-full bg-primary [animation-delay:-0.32s]" />
                      <span className="size-1.5 animate-[typing_1.4s_ease-in-out_infinite] rounded-full bg-primary [animation-delay:-0.16s]" />
                      <span className="size-1.5 animate-[typing_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
                    </div>
                  </div>
                  <span className="px-1 text-xs text-muted-foreground">{typingLabel}</span>
                </div>
              </div>
            )}
            {/* Real spacer — iOS ignores padding-bottom on overflow scrollers. */}
            <div className="h-8 w-full shrink-0" aria-hidden />
          </div>
        </div>
        {newBelow > 0 && !nearBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-xs rounded-full bg-primary px-3 py-1.5 text-s font-medium text-primary-foreground shadow-lg"
          >
            ↓ New messages{newBelow > 1 ? ` (${newBelow})` : ""}
          </button>
        )}
      </div>

      {/* Composer — hidden while searching so the keyboard stays on the find field. */}
      {!searchOpen && (
      <div className="shrink-0 border-t border-border/60 px-app pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-8">
        <div className="mx-auto w-full max-w-[1100px]">
          {inactive || readOnly || (replyOnly && !replyTo) ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-surface/30 px-4 py-3 text-center text-s text-muted-foreground">
              {inactive
                ? "This project is not active. The channel is read-only."
                : readOnly
                  ? "You have read-only access to this chat."
                  : "Only admins post here — react, or reply to an announcement."}
            </div>
          ) : (
          <>
          {pendingTaskRef && (
            <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-s">
              <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">Referencing task </span>
                <span className="font-medium">
                  #{fmtTaskNumber(pendingTaskRef.number)} · {pendingTaskRef.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingTaskRef(null)}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label="Remove task reference"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {mentionPickerOpen && (
            <div className="relative">
              <div className="absolute -top-1 left-0 z-10 w-full -translate-y-full overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
                <div className="border-b border-border/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  People in {title}
                </div>
                <ul className="max-h-60 overflow-y-auto py-1">
                  {mentionResults.map((m, i) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(m);
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-s",
                          i === mentionIndex ? "bg-surface" : "hover:bg-surface/60",
                        )}
                      >
                        {m.isAll ? (
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                            {m.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {m.isAll ? "@all" : m.name}
                        </span>
                        {m.isAll && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            Everyone
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {pickerOpen && (
            <div className="relative">
              <div className="absolute -top-1 left-0 z-10 w-full -translate-y-full overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
                <div className="border-b border-border/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tasks in {title}
                </div>
                <ul className="max-h-60 overflow-y-auto py-1">
                  {pickerResults.map((task, i) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickTask(task);
                        }}
                        onMouseEnter={() => setPickerIndex(i)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-s",
                          i === pickerIndex ? "bg-surface" : "hover:bg-surface/60",
                        )}
                      >
                        <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="font-mono text-xs uppercase text-muted-foreground">
                          #{fmtTaskNumber(task.number)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                        {task.statusName && (
                          <span className="flex shrink-0 items-center gap-xs rounded-full border border-border/60 bg-surface/60 px-2 py-0.5 text-xs text-muted-foreground">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: task.statusColor ?? "var(--muted-foreground)" }}
                            />
                            {task.statusName}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {replyingTo && (
            <div className="mb-2">
              <ReplyContext
                variant="composer"
                authorLabel={
                  replyingTo.authorId === currentMemberId ? "You" : replyingTo.authorName
                }
                body={replyingTo.body}
                attachments={replyingTo.attachments}
                onClick={() => jumpToMessage(replyingTo.id)}
                onDismiss={() => setReplyTo(null)}
              />
            </div>
          )}
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1.5 text-s"
                >
                  {p.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.previewUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="max-w-40 truncate">{p.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removePending(p.key)}
                    aria-label="Remove"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {composerUrl && !recording && (
            <LinkPreviewCard
              url={composerUrl}
              variant="composer"
              onDismiss={() => setDismissedPreview(composerUrl)}
            />
          )}
          {recordError && (
            <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-s text-destructive">
              {recordError}
            </div>
          )}
          {fileError && (
            <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-s text-destructive">
              <span>{fileError}</span>
              <button
                type="button"
                className="shrink-0 opacity-70 hover:opacity-100"
                onClick={() => setFileError(null)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {recording ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-[#131317] p-2 sm:gap-3">
              {holdRecording ? (
                <>
                  <div className="flex shrink-0 items-center gap-xs text-s">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full bg-destructive",
                        !slideCancelArmed && "animate-pulse",
                      )}
                      aria-hidden
                    />
                    <span className="font-medium tabular-nums">
                      {Math.floor(recordSecs / 60)}:
                      {String(recordSecs % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <VoiceVisualizer
                    analyserRef={analyserRef}
                    pausedRef={recordPausedRef}
                    paused={false}
                  />
                  <span
                    className={cn(
                      "shrink-0 text-s",
                      slideCancelArmed
                        ? "font-medium text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {slideCancelArmed ? "Release to cancel" : "Slide left to cancel"}
                  </span>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                    aria-label="Discard recording"
                    onClick={() => stopRecording(false)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="flex shrink-0 items-center gap-xs text-s">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full bg-destructive",
                        !recordPaused && "animate-pulse",
                      )}
                      aria-hidden
                    />
                    <span className="font-medium tabular-nums">
                      {Math.floor(recordSecs / 60)}:
                      {String(recordSecs % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <VoiceVisualizer
                    analyserRef={analyserRef}
                    pausedRef={recordPausedRef}
                    paused={recordPaused}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-full text-destructive hover:text-destructive"
                    onClick={togglePauseRecording}
                    aria-label={recordPaused ? "Resume recording" : "Pause recording"}
                  >
                    {recordPaused ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    className="shrink-0 rounded-full bg-success text-background hover:bg-success/90"
                    onClick={() => stopRecording(true)}
                    aria-label="Send voice message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ) : (
          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-[#131317] p-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="*/*"
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
                composerRef.current?.focus();
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
                composerRef.current?.focus();
              }}
            />
            <input
              ref={photosInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = "";
                composerRef.current?.focus();
              }}
            />
            {/* Mobile: attach sheet; desktop: direct files. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Attach"
                className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              >
                <Paperclip className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  <span className="flex-1">Camera</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => photosInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" />
                  <span className="flex-1">Photos</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <FileText className="h-4 w-4" />
                  <span className="flex-1">Files</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="hidden rounded-full lg:inline-flex"
              aria-label="Attach"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="relative flex-1">
              <div
                aria-hidden
                ref={mirrorRef}
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-2 text-[16px] leading-5 text-foreground md:text-s md:leading-normal"
              >
                {renderComposerHighlight(draft, composerMentionNames)}
                {"\u200b"}
              </div>
            <Textarea
              ref={composerRef}
              value={draft}
              enterKeyHint="enter"
              inputMode="text"
              autoCapitalize="sentences"
              onScroll={(e) => {
                const m = mirrorRef.current;
                if (m) {
                  m.scrollTop = e.currentTarget.scrollTop;
                  m.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                notifyTyping();
              }}
              onKeyDown={(e) => {
                if (mentionPickerOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => (i + 1) % mentionResults.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex(
                      (i) =>
                        (i - 1 + mentionResults.length) % mentionResults.length,
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pickMention(mentionResults[mentionIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft((d) => d.replace(/(^|\s)@[^\s@]*$/, "$1"));
                    return;
                  }
                }
                if (pickerOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPickerIndex((i) => (i + 1) % pickerResults.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPickerIndex(
                      (i) => (i - 1 + pickerResults.length) % pickerResults.length,
                    );
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pickTask(pickerResults[pickerIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setDraft((d) => d.replace(/(^|\s)#[^\s#]*$/, "$1"));
                    return;
                  }
                }
                if (e.key === "Escape" && replyTo) {
                  e.preventDefault();
                  setReplyTo(null);
                }
              }}
              placeholder={replyingTo ? "Reply…" : "Message"}
              onBlur={() => {
                if (window.scrollY !== 0 || window.scrollX !== 0) {
                  window.scrollTo(0, 0);
                }
              }}
              className="relative max-h-32 min-h-10 w-full resize-none overflow-y-auto border-0 !bg-transparent p-2 text-[16px] leading-5 !text-transparent caret-foreground shadow-none [field-sizing:fixed] focus-visible:ring-0 dark:!bg-transparent md:text-s md:leading-normal"
              rows={1}
            />
            </div>
            {draft.trim() || pending.length > 0 ? (
              <Button
                size="icon"
                className="size-11 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 lg:size-9"
                onPointerDown={(e) => {
                  // Keep the textarea focused so the keyboard stays open
                  // between sends (iOS otherwise collapses it on this tap).
                  e.preventDefault();
                }}
                onClick={send}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full touch-none select-none"
                onPointerDown={onMicPointerDown}
                aria-label="Hold to record voice message"
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
          </div>
          )}
          </>
          )}
        </div>
      </div>
      )}

      {lb.state && (
        <Lightbox
          images={lb.state.images}
          index={lb.state.index}
          onClose={lb.close}
          onIndex={lb.setIndex}
          renderMenu={(att) => {
            const msg = msgByAttachmentId.get(att.id);
            if (!msg) return null;
            const mine = msg.authorId === currentMemberId;
            return (
              <ImageActionsMenu
                onReact={(emoji) => react(msg.id, emoji)}
                onReply={() => {
                  lb.close();
                  handleReply(msg.id);
                }}
                onCopy={() => handleCopy(msg.body)}
                onEdit={
                  mine
                    ? () => {
                        lb.close();
                        handleEdit(msg.id);
                      }
                    : undefined
                }
                onCreateTask={
                  canCreateTask && target.projectId && !inactive
                    ? () => {
                        lb.close();
                        handleCreateTask(msg);
                      }
                    : undefined
                }
                onToggleImportant={() => {
                  lb.close();
                  handleToggleImportant(msg.id);
                }}
                important={Boolean(msg.important)}
                onDelete={() => {
                  lb.close();
                  handleDelete(msg.id);
                }}
              />
            );
          }}
        />
      )}
      {view === "files" && (
        <NoteSlideOver
          title="Media"
          onClose={closeThreadPanels}
          bodyClassName="flex flex-col overflow-hidden"
        >
          <FilesPanel messages={messages} />
        </NoteSlideOver>
      )}
      {view === "important" && (
        <NoteSlideOver title="Important" onClose={closeThreadPanels}>
            {importantLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!importantLoading && importantList.length === 0 && (
              <div className="px-6 py-10 text-center text-s text-muted-foreground">
                No important messages in this chat. Star a message from its menu to find it here.
              </div>
            )}
            {!importantLoading && importantList.length > 0 && (
              <ul className="flex flex-col">
                {importantList.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => jumpToMessage(m.id)}
                      className="flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left hover:bg-surface/60"
                    >
                      <span className="flex items-center gap-xs text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-orange text-orange" />
                        {new Date(m.createdAt).toLocaleDateString([], {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                      <span className="line-clamp-2 text-s text-foreground">
                        <span className="text-muted-foreground">{m.authorName}:</span>{" "}
                        {m.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </NoteSlideOver>
      )}

      {peopleOpen && isClientRoom && target.projectId && (
        <NoteSlideOver title="People" onClose={closeThreadPanels}>
          <div className="px-3 py-2">
            <ClientChatPeopleManager
              projectId={target.projectId}
              enabled
              compact
              clientView={clientUser}
              projectName={projectName ?? title}
            />
          </div>
        </NoteSlideOver>
      )}

      <CreateTaskFromMessageDialog
        open={!!createTaskPayload}
        onClose={() => setCreateTaskPayload(null)}
        payload={createTaskPayload}
        onCreated={(task) => {
          if (!threadKey || !target.projectId) return;
          // Project channel: optionally post a task reference via outbox.
          if (isProjectChannel) {
            enqueueOutboxMessage({
              threadKey,
              target,
              body: `Created task #${fmtTaskNumber(task.taskNumber)} · ${task.title}`,
              taskRefId: task.id,
              files: [],
            });
          } else {
            setPendingTaskRef({
              id: task.id,
              number: task.taskNumber,
              title: task.title,
              statusName: null,
              statusColor: null,
            });
          }
          setCreateTaskPayload(null);
        }}
      />
    </div>
  );
}
