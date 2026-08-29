"use client";

import type { InboxThread } from "@/actions/messages";
import { getThreadMessages } from "@/actions/messages";
import {
  conversationChannel,
  globalPresenceChannel,
  projectChannel,
  taskChannel,
} from "@/lib/channels";
import { mergeThreadMessages } from "@/lib/merge-thread-messages";
import type {
  ChatMessage,
  ThreadTarget,
} from "@/app/(dashboard)/dashboard/messages/[threadId]/thread-chat";

export { mergeThreadMessages };

export const THREAD_CACHE_LIMIT = 8;
const PREFETCH_MAX_INFLIGHT = 2;

export type ThreadCacheSnapshot = {
  channel: string;
  presenceChannel: string | null;
  target: ThreadTarget;
  title: string;
  subtitle: string;
  currentMemberId: string;
  messages: ChatMessage[];
  hasMoreOlder: boolean;
  memberNames: Record<string, string>;
  peerMemberIds: string[];
  mentionables: { id: string; name: string }[];
  inactive: boolean;
  readOnly: boolean;
  canCreateTask: boolean;
  allowedTaskTypes: string[];
  activeContractType: string | null;
  projectName?: string;
  peerLastReadAt: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  isClientRoom: boolean;
};

export type ThreadCacheEntry = {
  threadId: string;
  snapshot: ThreadCacheSnapshot;
  scrollTop: number | null;
  nearBottom: boolean;
  draft: string;
  /** True only after ThreadChat opened this thread with full server metadata. */
  opened: boolean;
  updatedAt: number;
};

const cache = new Map<string, ThreadCacheEntry>();
const inflightPrefetch = new Set<string>();

export function threadIdFromTarget(target: ThreadTarget): string | null {
  if (target.conversationId) return `conv-${target.conversationId}`;
  if (target.taskId) return `task-${target.taskId}`;
  if (target.projectId) return `project-${target.projectId}`;
  return null;
}

export function peekThreadCache(threadId: string | null | undefined): ThreadCacheEntry | null {
  if (!threadId) return null;
  return cache.get(threadId) ?? null;
}

export function putThreadCache(
  threadId: string,
  patch: Partial<Omit<ThreadCacheEntry, "threadId" | "updatedAt">> & {
    snapshot?: ThreadCacheSnapshot;
  },
): ThreadCacheEntry {
  const prev = cache.get(threadId);
  const next: ThreadCacheEntry = {
    threadId,
    snapshot: patch.snapshot ?? prev?.snapshot ?? emptySnapshot(threadId),
    scrollTop: patch.scrollTop !== undefined ? patch.scrollTop : (prev?.scrollTop ?? null),
    nearBottom: patch.nearBottom ?? prev?.nearBottom ?? true,
    draft: patch.draft ?? prev?.draft ?? "",
    opened: patch.opened ?? prev?.opened ?? false,
    updatedAt: Date.now(),
  };
  if (cache.has(threadId)) cache.delete(threadId);
  cache.set(threadId, next);
  while (cache.size > THREAD_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
  return next;
}

function emptySnapshot(threadId: string): ThreadCacheSnapshot {
  return {
    channel: "",
    presenceChannel: null,
    target: targetFromThreadId(threadId),
    title: "",
    subtitle: "",
    currentMemberId: "",
    messages: [],
    hasMoreOlder: false,
    memberNames: {},
    peerMemberIds: [],
    mentionables: [],
    inactive: false,
    readOnly: false,
    canCreateTask: false,
    allowedTaskTypes: [],
    activeContractType: null,
    peerLastReadAt: null,
    lastReadAt: null,
    unreadCount: 0,
    isClientRoom: false,
  };
}

export function targetFromThreadId(threadId: string): ThreadTarget {
  if (threadId.startsWith("conv-")) return { conversationId: threadId.slice(5) };
  if (threadId.startsWith("task-")) return { taskId: threadId.slice(5) };
  if (threadId.startsWith("project-")) return { projectId: threadId.slice(8) };
  return {};
}

export function channelsForThread(thread: {
  id: string;
  kind: InboxThread["kind"];
  projectId: string | null;
  conversationId: string | null;
}): { channel: string; presenceChannel: string | null } {
  if (thread.conversationId) {
    return {
      channel: conversationChannel(thread.conversationId),
      presenceChannel: globalPresenceChannel(),
    };
  }
  if (thread.kind === "project" && thread.projectId) {
    return {
      channel: projectChannel(thread.projectId),
      presenceChannel: projectChannel(thread.projectId),
    };
  }
  if (thread.id.startsWith("task-")) {
    const taskId = thread.id.slice(5);
    return { channel: taskChannel(taskId), presenceChannel: taskChannel(taskId) };
  }
  return { channel: "", presenceChannel: null };
}

export function snapshotFromInboxThread(
  thread: InboxThread,
  currentMemberId: string,
): ThreadCacheSnapshot {
  const { channel, presenceChannel } = channelsForThread(thread);
  return {
    channel,
    presenceChannel,
    target: {
      conversationId: thread.conversationId,
      projectId: thread.kind === "project" ? thread.projectId : null,
    },
    title: thread.name,
    subtitle: thread.subtitle,
    currentMemberId,
    messages: [],
    hasMoreOlder: false,
    memberNames: {},
    peerMemberIds: thread.peerMemberIds,
    mentionables: [],
    inactive: thread.inactive,
    readOnly: false,
    canCreateTask: false,
    allowedTaskTypes: [],
    activeContractType: null,
    peerLastReadAt: null,
    lastReadAt: null,
    unreadCount: thread.unread,
    isClientRoom: thread.kind === "client",
  };
}

export function prefetchInboxThread(
  thread: InboxThread,
  currentMemberId: string,
): void {
  if (typeof window === "undefined") return;
  if (inflightPrefetch.has(thread.id)) return;
  if (inflightPrefetch.size >= PREFETCH_MAX_INFLIGHT) return;

  const target = thread.conversationId
    ? { conversationId: thread.conversationId }
    : thread.kind === "project" && thread.projectId
      ? { projectId: thread.projectId }
      : null;
  if (!target) return;

  inflightPrefetch.add(thread.id);
  void getThreadMessages(target)
    .then((page) => {
      const prev = peekThreadCache(thread.id);
      const base = prev?.snapshot ?? snapshotFromInboxThread(thread, currentMemberId);
      putThreadCache(thread.id, {
        snapshot: {
          ...base,
          currentMemberId: currentMemberId || base.currentMemberId,
          messages: mergeThreadMessages(base.messages, page.messages as ChatMessage[]),
          // This page is only the newest slice. An existing snapshot may already
          // reach further back, so its answer wins; `page.hasMore` only applies
          // when there was nothing cached to compare against.
          hasMoreOlder: base.messages.length > 0 ? base.hasMoreOlder : page.hasMore,
          lastReadAt: page.lastReadAt,
          unreadCount: page.unreadCount,
        },
      });
    })
    .catch(() => {})
    .finally(() => {
      inflightPrefetch.delete(thread.id);
    });
}
