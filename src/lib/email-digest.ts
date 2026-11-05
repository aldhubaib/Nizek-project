import "server-only";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { CLIENT_CONVERSATION_KIND } from "@/lib/client-chat";
import {
  defaultThreadLevel,
  isThreadNotificationLevel,
  type ThreadNotificationLevel,
} from "@/lib/notification-prefs";
import {
  EMAIL_DIGEST_LOOKBACK_MS,
  EMAIL_DIGEST_MAX_LINES,
  buildDigestEmail,
  shouldSendDigest,
  type EmailDigestJob,
} from "@/lib/email-digest-core";

/**
 * Email fallback for chat (runs in the worker). See email-digest-core.ts for
 * the flow. Everything here is best-effort: a missing Resend key or a
 * database hiccup logs and returns — the in-app notification and the push
 * already happened.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://panel.nizek.com").replace(/\/$/, "");

function fromAddress(): string {
  return process.env.RESEND_FROM?.trim() || "Nizek <onboarding@resend.dev>";
}

/** Redis key remembering when the last digest for this pair went out. */
const sentKey = (userId: string, threadKey: string) => `digest-sent:${userId}:${threadKey}`;

async function levelFor(userId: string, threadKey: string): Promise<ThreadNotificationLevel> {
  const row = await prisma.threadNotificationPref.findUnique({
    where: { userId_threadKey: { userId, threadKey } },
    select: { level: true },
  });
  return row && isThreadNotificationLevel(row.level) ? row.level : defaultThreadLevel(threadKey);
}

/** Human name of the thread for the subject line. */
async function threadNameFor(threadKey: string, recipientId: string): Promise<string> {
  const [kind, id] = [threadKey.slice(0, threadKey.indexOf("-")), threadKey.slice(threadKey.indexOf("-") + 1)];
  if (kind === "project") {
    const p = await prisma.project.findUnique({ where: { id }, select: { name: true } });
    return p?.name ?? "a project";
  }
  if (kind === "task") {
    const t = await prisma.task.findUnique({
      where: { id },
      select: { title: true, project: { select: { name: true } } },
    });
    return t ? `${t.title}${t.project ? ` (${t.project.name})` : ""}` : "a task";
  }
  const convo = await prisma.conversation.findUnique({
    where: { id },
    select: {
      title: true,
      isGroup: true,
      kind: true,
      projectId: true,
      project: { select: { name: true } },
      participants: {
        select: { memberId: true, member: { select: { name: true, email: true } } },
      },
    },
  });
  if (!convo) return "a conversation";
  if (convo.kind === CLIENT_CONVERSATION_KIND) return convo.project?.name ?? "your project";
  if (convo.isGroup) return convo.title?.trim() || "a group";
  const peer = convo.participants.find((p) => p.memberId !== recipientId);
  if (!peer) return "a conversation";
  return peer.member.name?.trim() || peer.member.email;
}

export type DigestOutcome =
  | "sent"
  | "caught-up"
  | "level-none"
  | "nothing-new"
  | "no-email"
  | "not-configured";

/** One delayed job: email the person if the thread is still unread. */
export async function processEmailDigest(job: EmailDigestJob): Promise<DigestOutcome> {
  const { userId, threadKey } = job;
  const level = await levelFor(userId, threadKey);
  if (level === "none") return "level-none";

  const since = new Date(Date.now() - EMAIL_DIGEST_LOOKBACK_MS);
  const tag = `thread-${threadKey}`;
  const [unread, total, cursor] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: userId, read: false, tag, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      take: EMAIL_DIGEST_MAX_LINES,
      select: { title: true, body: true, linkUrl: true, createdAt: true },
    }),
    prisma.notification.count({
      where: { recipientId: userId, read: false, tag, createdAt: { gt: since } },
    }),
    prisma.chatReadCursor.findUnique({
      where: { userId_threadId: { userId, threadId: threadKey } },
      select: { lastReadAt: true },
    }),
  ]);
  const newest = unread[0]?.createdAt ?? null;
  if (!shouldSendDigest({ level, unreadCount: total, lastReadAt: cursor?.lastReadAt ?? null, newestUnreadAt: newest })) {
    return "caught-up";
  }

  // Only lines newer than the previous digest, so a long-unread thread does
  // not repeat the same five lines every few minutes.
  let lastSentAt: Date | null = null;
  try {
    const raw = await getRedis().get(sentKey(userId, threadKey));
    if (raw) lastSentAt = new Date(raw);
  } catch {
    // No Redis → no de-duplication, still send.
  }
  const fresh = lastSentAt ? unread.filter((n) => n.createdAt > lastSentAt) : unread;
  if (fresh.length === 0) return "nothing-new";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, blocked: true },
  });
  if (!user?.email || user.blocked) return "no-email";

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.warn("[email-digest] RESEND_API_KEY missing — digest emails are disabled");
    return "not-configured";
  }

  const threadName = await threadNameFor(threadKey, userId);
  const link = `${APP_URL}${fresh[0].linkUrl ?? `/dashboard/messages/${threadKey}`}`;
  // Oldest first reads like a conversation.
  const lines = [...fresh].reverse();
  const mail = buildDigestEmail({ threadName, lines, total, link });

  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: user.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);

  try {
    await getRedis().set(sentKey(userId, threadKey), new Date().toISOString(), "EX", 24 * 60 * 60);
  } catch {
    // Best effort.
  }
  return "sent";
}
