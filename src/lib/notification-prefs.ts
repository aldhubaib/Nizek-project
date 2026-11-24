// Pure preference-filtering logic, separated from data access so it is unit
// testable. Server enforcement lives in notify.ts (before the outbox row): a filtered
// recipient gets no Notification row, no push, and therefore no chime anywhere.

export type NotificationTypeKey =
  | "message"
  | "mention"
  | "rejection"
  | "deadline";

export interface PreferenceFlags {
  notifyMessages: boolean;
  notifyMentions: boolean;
  notifyRejections: boolean;
  notifyDeadlines: boolean;
  soundEnabled: boolean;
}

export const DEFAULT_PREFERENCES: PreferenceFlags = {
  notifyMessages: true,
  notifyMentions: true,
  notifyRejections: true,
  notifyDeadlines: true,
  soundEnabled: true,
};

/** Maps a notification `type` string to the preference flag that gates it. */
export function typeAllowedByPreferences(
  type: string,
  prefs: PreferenceFlags,
): boolean {
  switch (type) {
    case "message":
      return prefs.notifyMessages;
    case "mention":
      return prefs.notifyMentions;
    case "rejection":
      return prefs.notifyRejections;
    case "deadline":
      return prefs.notifyDeadlines;
    default:
      // Unknown types are never silently dropped.
      return true;
  }
}

// ─── Per-thread notification level ───────────────────────────────────────────

/**
 * all      — every message in the thread notifies
 * mentions — only messages that name the person (@mention, @all, a reply to them)
 * none     — nothing from this thread, ever (no row, no push, no chime, no email)
 */
export type ThreadNotificationLevel = "all" | "mentions" | "none";

export const THREAD_NOTIFICATION_LEVELS: readonly ThreadNotificationLevel[] = [
  "all",
  "mentions",
  "none",
];

export function isThreadNotificationLevel(v: unknown): v is ThreadNotificationLevel {
  return typeof v === "string" && (THREAD_NOTIFICATION_LEVELS as string[]).includes(v);
}

/**
 * What a thread does when the person never chose a level. Every thread starts
 * at every message. Mentions and Off are explicit choices, stored per person.
 */
export function defaultThreadLevel(
  _threadKey: string | null | undefined,
): ThreadNotificationLevel {
  return "all";
}

export function effectiveThreadLevel(
  threadKey: string | null | undefined,
  stored: ThreadNotificationLevel | null | undefined,
): ThreadNotificationLevel {
  return stored ?? defaultThreadLevel(threadKey);
}

/**
 * Filters recipients down to those who should receive a notification of the
 * given type in the given thread, according to their stored preferences and
 * their per-thread level. Missing preference rows mean "all defaults"
 * (everything on); a missing level means every message. Mentions only keeps
 * people listed in `mentionedIds` — the type string does not widen that set.
 */
export function filterRecipientsByPreferences(input: {
  recipientIds: string[];
  type: string;
  threadKey?: string | null;
  prefsByUser: Map<string, PreferenceFlags>;
  /** Stored level per user for `threadKey`; absent = thread default. */
  levelsByUser?: Map<string, ThreadNotificationLevel>;
  /** Who this message names (@mention, @all expansion, reply target). */
  mentionedIds?: Iterable<string>;
}): string[] {
  const { recipientIds, type, threadKey, prefsByUser } = input;
  const levels = input.levelsByUser ?? new Map<string, ThreadNotificationLevel>();
  const mentioned = new Set(input.mentionedIds ?? []);
  return recipientIds.filter((rid) => {
    const prefs = prefsByUser.get(rid) ?? DEFAULT_PREFERENCES;
    if (!typeAllowedByPreferences(type, prefs)) return false;
    // Levels are per thread; events with no thread (deadlines) are unaffected.
    if (!threadKey) return true;
    const level = effectiveThreadLevel(threadKey, levels.get(rid));
    if (level === "none") return false;
    if (level === "mentions") return mentioned.has(rid);
    return true;
  });
}
