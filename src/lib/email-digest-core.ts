// Email fallback for chat: pure helpers (no Prisma / Redis / Resend) shared by
// the worker and the unit tests. src/lib/email-digest.ts does the I/O.
//
// Flow: when the worker creates notifications for a message, it schedules one
// delayed job per recipient + thread (jobId digest:{userId}:{threadKey}, so a
// burst of messages collapses into one job). Five minutes later the processor
// checks whether those notifications are still unread; if so, one email with
// up to five lines and a link goes out through Resend.

export const EMAIL_DIGEST_QUEUE_NAME = "email-digests";
export const EMAIL_DIGEST_DELAY_MS = 5 * 60 * 1000;
export const EMAIL_DIGEST_MAX_LINES = 5;
/** Unread rows older than this are not worth emailing about any more. */
export const EMAIL_DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type EmailDigestJob = { userId: string; threadKey: string };

export function emailDigestJobId(userId: string, threadKey: string): string {
  return `digest:${userId}:${threadKey}`;
}

export interface EmailDigestQueueLike {
  add(
    name: string,
    data: EmailDigestJob,
    opts: { jobId: string; delay: number },
  ): Promise<unknown>;
}

/** One job per recipient + thread; an existing delayed job wins (BullMQ ignores the duplicate id). */
export async function enqueueEmailDigests(
  queue: EmailDigestQueueLike,
  recipientIds: Iterable<string>,
  threadKey: string,
  delayMs = EMAIL_DIGEST_DELAY_MS,
): Promise<number> {
  let added = 0;
  for (const userId of new Set(recipientIds)) {
    if (!userId) continue;
    await queue.add(
      "send",
      { userId, threadKey },
      { jobId: emailDigestJobId(userId, threadKey), delay: delayMs },
    );
    added++;
  }
  return added;
}

/**
 * Whether the email should go out. The person is "caught up" when they read
 * the thread after the newest unread message landed, or when every row has
 * been marked read; level "none" never emails.
 */
export function shouldSendDigest(input: {
  level: "all" | "mentions" | "none";
  unreadCount: number;
  /** ChatReadCursor.lastReadAt for the thread, if any. */
  lastReadAt: Date | null;
  /** createdAt of the newest unread notification. */
  newestUnreadAt: Date | null;
}): boolean {
  if (input.level === "none") return false;
  if (input.unreadCount === 0 || !input.newestUnreadAt) return false;
  if (input.lastReadAt && input.lastReadAt >= input.newestUnreadAt) return false;
  return true;
}

/** "Ali · Direct message" → "Ali"; titles without the separator pass through. */
export function authorFromTitle(title: string): string {
  const idx = title.indexOf(" · ");
  return (idx === -1 ? title : title.slice(0, idx)).trim() || "Someone";
}

export type DigestLine = { title: string; body: string | null; createdAt: Date };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Subject, plain text and HTML for one digest. Lines come from Notification
 * rows, which are already alias-masked for client recipients, so no masking
 * happens here — only the thread name has to be masked by the caller.
 */
export function buildDigestEmail(input: {
  threadName: string;
  lines: DigestLine[];
  /** Total unread rows, may exceed lines.length. */
  total: number;
  link: string;
  appName?: string;
}): { subject: string; text: string; html: string } {
  const appName = input.appName ?? "Nizek";
  const total = Math.max(input.total, input.lines.length);
  const shown = input.lines.slice(0, EMAIL_DIGEST_MAX_LINES);
  const more = total - shown.length;
  const plural = total === 1 ? "message" : "messages";
  const subject = `${total} new ${plural} in ${input.threadName}`;

  const textLines = shown.map((l) => {
    const body = (l.body ?? "").trim();
    return body ? `${authorFromTitle(l.title)}: ${body}` : authorFromTitle(l.title);
  });
  const text = [
    `You have ${total} unread ${plural} in ${input.threadName}.`,
    "",
    ...textLines,
    more > 0 ? `…and ${more} more` : "",
    "",
    `Open the conversation: ${input.link}`,
    "",
    `You are getting this because the ${plural} stayed unread for a few minutes. Change what notifies you from the thread menu in ${appName}.`,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");

  const htmlLines = shown
    .map((l) => {
      const body = (l.body ?? "").trim();
      return `<li style="margin:0 0 8px"><strong>${escapeHtml(authorFromTitle(l.title))}</strong>${
        body ? `: ${escapeHtml(body)}` : ""
      }</li>`;
    })
    .join("");
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>You have <strong>${total}</strong> unread ${plural} in <strong>${escapeHtml(input.threadName)}</strong>.</p>
<ul style="padding-left:20px">${htmlLines}</ul>
${more > 0 ? `<p style="color:#555">…and ${more} more</p>` : ""}
<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:8px">Open the conversation</a></p>
<p style="color:#777;font-size:13px">You are getting this because the ${plural} stayed unread for a few minutes. Change what notifies you from the thread menu in ${escapeHtml(appName)}.</p>
</body></html>`;

  return { subject, text, html };
}
