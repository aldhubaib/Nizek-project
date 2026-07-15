// Pure preference-filtering logic, separated from data access so it is unit
// testable. Server enforcement lives in notify.ts / sendPush callers: a filtered
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

/**
 * Filters recipients down to those who should receive a notification of the
 * given type in the given thread, according to their stored preferences and
 * thread mutes. Missing preference rows mean "all defaults" (everything on).
 */
export function filterRecipientsByPreferences(input: {
  recipientIds: string[];
  type: string;
  threadKey?: string | null;
  prefsByUser: Map<string, PreferenceFlags>;
  mutedPairs: Set<string>; // entries: `${userId}:${threadKey}`
}): string[] {
  const { recipientIds, type, threadKey, prefsByUser, mutedPairs } = input;
  return recipientIds.filter((rid) => {
    const prefs = prefsByUser.get(rid) ?? DEFAULT_PREFERENCES;
    if (!typeAllowedByPreferences(type, prefs)) return false;
    if (threadKey && mutedPairs.has(`${rid}:${threadKey}`)) return false;
    return true;
  });
}
