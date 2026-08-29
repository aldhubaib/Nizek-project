import { prisma } from "@/lib/prisma";
import { isClientUser } from "@/lib/client-chat";

export const ANNOUNCEMENTS_CONVERSATION_KIND = "announcements" as const;
/**
 * Fixed primary key — there is exactly one announcements room app-wide, so the
 * id is a constant rather than something to look up. Conversation's
 * @@unique([projectId, kind]) can't enforce a singleton here, because Postgres
 * lets NULL projectId repeat.
 */
export const ANNOUNCEMENTS_CONVERSATION_ID = "announcements";
export const ANNOUNCEMENTS_THREAD_ID = `conv-${ANNOUNCEMENTS_CONVERSATION_ID}`;
export const ANNOUNCEMENTS_TITLE = "Announcements";
export const ANNOUNCEMENTS_SUBTITLE = "Company-wide · admins post";

type MaybeUser = { systemRole: string } | null | undefined;

/** Membership is virtual: every non-client user is in the channel. */
export function canReadAnnouncements(user: MaybeUser): boolean {
  return Boolean(user) && !isClientUser(user);
}

/** Only system admins start a thread; everyone else is limited to replies. */
export function canPostAnnouncement(user: MaybeUser): boolean {
  return user?.systemRole === "ADMIN";
}

const CONVERSATION_SELECT = {
  id: true,
  title: true,
  kind: true,
  updatedAt: true,
} as const;

/**
 * Read-first so the steady state (the room already exists) costs one SELECT —
 * this runs on every inbox load. An upsert would write on each of those.
 */
export async function getOrCreateAnnouncementsConversation() {
  const existing = await prisma.conversation.findUnique({
    where: { id: ANNOUNCEMENTS_CONVERSATION_ID },
    select: CONVERSATION_SELECT,
  });
  if (existing) return existing;
  try {
    return await prisma.conversation.create({
      data: {
        id: ANNOUNCEMENTS_CONVERSATION_ID,
        kind: ANNOUNCEMENTS_CONVERSATION_KIND,
        title: ANNOUNCEMENTS_TITLE,
        isGroup: true,
      },
      select: CONVERSATION_SELECT,
    });
  } catch {
    // Lost a race with another request creating the same fixed id.
    return prisma.conversation.findUniqueOrThrow({
      where: { id: ANNOUNCEMENTS_CONVERSATION_ID },
      select: CONVERSATION_SELECT,
    });
  }
}

/**
 * Everyone who receives an announcement. Resolved per send rather than stored
 * as participant rows, so new hires are covered without a backfill.
 */
export async function announcementAudienceIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { systemRole: { not: "CLIENT" }, blocked: false },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
