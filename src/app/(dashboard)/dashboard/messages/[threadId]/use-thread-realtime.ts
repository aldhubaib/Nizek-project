"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  getThreadMessages,
  markThreadRead,
  type MessageDTO,
  type ReactionSummary,
} from "@/actions/messages";
import { useChannel } from "@/components/realtime/hooks";
import { subscribeDelivered } from "@/lib/message-outbox";
import { closePushBannersByTags } from "@/lib/close-push-banners";
import { threadPushTag } from "@/lib/notification-read";
import { updateAppBadge } from "@/lib/app-badge";
import { useNotificationStore } from "@/store/notifications";
import type { ChatMessage, ThreadTarget } from "./thread-shared";

/**
 * Everything that pushes thread state from outside React: the Centrifugo
 * channel, the outbox delivery bridge, read receipts, and the visibility-driven
 * catch-up refetch after the socket has been asleep.
 */
export function useThreadRealtime({
  channel,
  target,
  threadKey,
  currentMemberId,
  setMessages,
  setNewBelow,
  setPeerLastReadAt,
  nearBottomRef,
}: {
  channel: string;
  target: ThreadTarget;
  threadKey: string | null;
  currentMemberId: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setNewBelow: React.Dispatch<React.SetStateAction<number>>;
  setPeerLastReadAt: React.Dispatch<React.SetStateAction<string | null>>;
  nearBottomRef: React.RefObject<boolean>;
}) {
  // When the outbox manager finishes delivering one of this thread's messages,
  // append the server-confirmed message (no refetch). If the user is on
  // another page at that moment, nothing is subscribed and the message is
  // simply included in the next server render of the thread.
  useEffect(() => {
    if (!threadKey) return;
    return subscribeDelivered(threadKey, (m, replyToId) => {
      setMessages((prev) =>
        prev.some((x) => x.id === m.id)
          ? prev
          : [
              ...prev,
              {
                id: m.id,
                authorId: m.authorId,
                authorName: m.authorName,
                authorImageUrl: m.authorImageUrl ?? null,
                body: m.body,
                createdAt: m.createdAt,
                updatedAt: (m as { updatedAt?: string }).updatedAt,
                edited: (m as { edited?: boolean }).edited,
                attachments: m.attachments,
                reactions: [],
                replyToId,
                kind: m.kind,
                task: m.task ?? null,
                mentions: m.mentions ?? [],
                important: false,
                noteComment: m.noteComment ?? null,
                taskComment: m.taskComment ?? null,
                noteActivity: m.noteActivity ?? null,
                proofBypass: m.proofBypass ?? null,
              },
            ],
      );
    });
  }, [threadKey]);

  // Reconcile with the server after a gap in realtime coverage — failed
  // history recovery on the channel, or coming back from a long background —
  // by fetching the newest page and appending whatever we don't have. This is
  // what used to require a manual refresh: a DM sent while the phone was
  // locked reconnected to a channel whose replay window had passed, and
  // nothing ever refetched.
  const refreshingRef = useRef(false);
  const refreshLatest = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const page = await getThreadMessages(target);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = page.messages.filter((m) => !seen.has(m.id));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
    } catch {
      // Best-effort — the next navigation reconciles.
    } finally {
      refreshingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.taskId, target.projectId, target.conversationId]);

  // Mark this thread's notifications read — but only while someone is actually
  // looking at it. The server component deliberately no longer marks anything
  // (link prefetch was silently marking threads read), so read-state is owned
  // here: on open in a visible tab, whenever the tab becomes visible again,
  // and (debounced) when messages arrive while the user is watching.
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (threadKey) {
      useNotificationStore.getState().clearThreadUnread(threadKey);
    }
    const tag = threadPushTag(target);
    if (tag) void closePushBannersByTags([tag]);
    void markThreadRead(target)
      .then((counts) => {
        if (counts && typeof counts.unread === "number") {
          useNotificationStore.getState().reconcileCounts(counts);
          updateAppBadge(Math.max(0, counts.unread));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.taskId, target.projectId, target.conversationId, threadKey]);

  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    markRead();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      markRead();
      // Backgrounded long enough for the WebSocket to have been dropped (or
      // killed by the OS) — catch up on anything published meanwhile.
      if (hiddenAtRef.current && Date.now() - hiddenAtRef.current > 10_000) {
        void refreshLatest();
      }
      hiddenAtRef.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markRead, refreshLatest]);

  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestMarkRead = useCallback(() => {
    if (markReadTimerRef.current) return;
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      markRead();
    }, 800);
  }, [markRead]);
  useEffect(
    () => () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    },
    [],
  );

  useChannel(channel, (data) => {
    const d = data as
      | {
          type?: string;
          message?: MessageDTO;
          messageId?: string;
          reactions?: ReactionSummary[];
          body?: string;
          updatedAt?: string;
          edited?: boolean;
          memberId?: string;
          lastReadAt?: string;
        }
      | null;
    if (!d) return;
    if (d.type === "message.new" && d.message) {
      const m = d.message;
      // A message arriving while the user is watching this thread counts as
      // read — otherwise it stays unread in the DB until the next page load.
      if (m.authorId !== currentMemberId) {
        requestMarkRead();
        if (!nearBottomRef.current) {
          setNewBelow((n) => n + 1);
        }
      }
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [
          ...prev,
          {
            id: m.id,
            authorId: m.authorId,
            authorName: m.authorName,
            authorImageUrl: m.authorImageUrl ?? null,
            body: m.body,
            createdAt: m.createdAt,
            updatedAt: (m as MessageDTO & { updatedAt?: string }).updatedAt,
            edited: (m as MessageDTO & { edited?: boolean }).edited,
            attachments: m.attachments ?? [],
            reactions: [],
            replyToId: m.replyToId ?? null,
            kind: m.kind,
            task: m.task ?? null,
            mentions: m.mentions ?? [],
            deadlineReminder: m.deadlineReminder ?? null,
            noteComment: m.noteComment ?? null,
            taskComment: m.taskComment ?? null,
            noteActivity: m.noteActivity ?? null,
            proofBypass: m.proofBypass ?? null,
            important: false,
          },
        ];
      });
    } else if (d.type === "message.updated" && d.messageId) {
      const { messageId, body, updatedAt, edited } = d;
      setMessages((prev) =>
        prev.map((x) =>
          x.id === messageId
            ? {
                ...x,
                body: body ?? x.body,
                updatedAt: updatedAt ?? x.updatedAt,
                edited: edited ?? true,
              }
            : x,
        ),
      );
    } else if (d.type === "thread.read" && d.memberId && d.memberId !== currentMemberId) {
      if (d.lastReadAt) {
        setPeerLastReadAt((prev) => {
          if (!prev) return d.lastReadAt!;
          return new Date(d.lastReadAt!).getTime() > new Date(prev).getTime()
            ? d.lastReadAt!
            : prev;
        });
      }
    } else if (d.type === "reaction.updated" && d.messageId) {
      const { messageId, reactions } = d;
      setMessages((prev) =>
        prev.map((x) =>
          x.id === messageId ? { ...x, reactions: reactions ?? [] } : x,
        ),
      );
    } else if (d.type === "message.deleted" && d.messageId) {
      const { messageId } = d;
      setMessages((prev) => prev.filter((x) => x.id !== messageId));
    }
    // Reconnected but the missed events couldn't be replayed — refetch.
  }, () => void refreshLatest());

  return { markRead, requestMarkRead, refreshLatest };
}
