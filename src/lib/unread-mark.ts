/**
 * How to store a personal unread reminder without moving a read receipt.
 *
 * An existing cursor is only flagged. A missing cursor can be created at "now"
 * for a normal chat, because a missing cursor already counts as zero unread.
 * A client room that was never opened already counts every message, so creating
 * a cursor at "now" would hide that history. Leave it alone.
 */
export function unreadMarkPlan(input: {
  hasCursor: boolean;
  clientRoomNeverOpened: boolean;
}): "flag" | "create" | "skip" {
  if (input.hasCursor) return "flag";
  if (input.clientRoomNeverOpened) return "skip";
  return "create";
}
