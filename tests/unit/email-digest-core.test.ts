import { describe, expect, it } from "vitest";
import {
  EMAIL_DIGEST_DELAY_MS,
  authorFromTitle,
  buildDigestEmail,
  emailDigestJobId,
  enqueueEmailDigests,
  shouldSendDigest,
} from "@/lib/email-digest-core";

describe("email digest: job identity", () => {
  it("one job id per person per thread", () => {
    expect(emailDigestJobId("u1", "conv-9")).toBe("digest:u1:conv-9");
  });

  it("enqueues one delayed job per distinct recipient", async () => {
    const calls: Array<{ data: unknown; opts: { jobId: string; delay: number } }> = [];
    const queue = {
      add: async (_name: string, data: unknown, opts: { jobId: string; delay: number }) => {
        calls.push({ data, opts });
      },
    };
    const added = await enqueueEmailDigests(queue, ["a", "b", "a", ""], "project-1");
    expect(added).toBe(2);
    expect(calls.map((c) => c.opts.jobId)).toEqual(["digest:a:project-1", "digest:b:project-1"]);
    expect(calls[0].opts.delay).toBe(EMAIL_DIGEST_DELAY_MS);
    expect(calls[0].data).toEqual({ userId: "a", threadKey: "project-1" });
  });
});

describe("email digest: shouldSendDigest", () => {
  const t0 = new Date("2026-01-01T10:00:00Z");
  const t1 = new Date("2026-01-01T10:05:00Z");

  it("sends when unread and never read", () => {
    expect(shouldSendDigest({ level: "all", unreadCount: 2, lastReadAt: null, newestUnreadAt: t1 })).toBe(true);
  });

  it("skips when the thread was read after the newest message", () => {
    expect(shouldSendDigest({ level: "all", unreadCount: 2, lastReadAt: t1, newestUnreadAt: t0 })).toBe(false);
  });

  it("sends when the thread was read before the newest message", () => {
    expect(shouldSendDigest({ level: "mentions", unreadCount: 1, lastReadAt: t0, newestUnreadAt: t1 })).toBe(true);
  });

  it("never emails when the level is none or nothing is unread", () => {
    expect(shouldSendDigest({ level: "none", unreadCount: 5, lastReadAt: null, newestUnreadAt: t1 })).toBe(false);
    expect(shouldSendDigest({ level: "all", unreadCount: 0, lastReadAt: null, newestUnreadAt: null })).toBe(false);
  });
});

describe("email digest: content", () => {
  it("extracts the author from the notification title", () => {
    expect(authorFromTitle("Sara · Direct message")).toBe("Sara");
    expect(authorFromTitle("Mentioned you")).toBe("Mentioned you");
    expect(authorFromTitle("   ")).toBe("Someone");
  });

  it("caps at five lines, counts the rest and includes the link", () => {
    const lines = Array.from({ length: 7 }, (_, i) => ({
      title: `User ${i} · Project`,
      body: `line ${i}`,
      createdAt: new Date(),
    }));
    const mail = buildDigestEmail({ threadName: "Website redesign", lines, total: 9, link: "https://x/t" });
    expect(mail.subject).toBe("9 new messages in Website redesign");
    expect(mail.text).toContain("User 0: line 0");
    expect(mail.text).toContain("User 4: line 4");
    expect(mail.text).not.toContain("line 5");
    expect(mail.text).toContain("…and 4 more");
    expect(mail.text).toContain("https://x/t");
    expect(mail.html).toContain('href="https://x/t"');
  });

  it("escapes html in bodies and names", () => {
    const mail = buildDigestEmail({
      threadName: "<b>x</b>",
      lines: [{ title: "A<script> · DM", body: "1 < 2 & \"q\"", createdAt: new Date() }],
      total: 1,
      link: "https://x",
    });
    expect(mail.subject).toBe("1 new message in <b>x</b>");
    expect(mail.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(mail.html).toContain("A&lt;script&gt;");
    expect(mail.html).toContain("1 &lt; 2 &amp; &quot;q&quot;");
    expect(mail.html).not.toContain("<script>");
  });
});
