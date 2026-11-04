// Per-member read receipts for conversations.
//
// Previously a thread kept ONE "peer last read" timestamp — the newest read
// among all other members. In a group or client room that meant the moment any
// single person opened the chat, the sender's message flipped to "Seen" as if
// everyone had read it. Receipts are now tracked per member so 1:1 chats keep
// the familiar double tick and groups can say exactly who has seen a message.

/** memberId -> ISO timestamp of that member's last read. Never includes self. */
export type PeerReads = Record<string, string>;

export type ReceiptState = "sent" | "some" | "all";

const ms = (iso: string) => new Date(iso).getTime();

/** Keeps the newest read time per member (events can arrive out of order). */
export function applyPeerRead(
  reads: PeerReads,
  memberId: string,
  lastReadAt: string,
): PeerReads {
  const prev = reads[memberId];
  if (prev && ms(prev) >= ms(lastReadAt)) return reads;
  return { ...reads, [memberId]: lastReadAt };
}

/** Members whose last read is at or after the message time. */
export function readersOf(reads: PeerReads, createdAt: string): string[] {
  const at = ms(createdAt);
  return Object.keys(reads).filter((id) => ms(reads[id]) >= at);
}

/**
 * Receipt for one own message. `peerCount` is how many other people are in
 * the thread; when unknown (0) it falls back to the members we have reads for,
 * so a 1:1 chat still shows "all" once the one peer has read.
 */
export function receiptFor(
  reads: PeerReads,
  createdAt: string,
  peerCount: number,
): ReceiptState {
  const readers = readersOf(reads, createdAt).length;
  if (readers === 0) return "sent";
  const total = peerCount > 0 ? peerCount : Object.keys(reads).length;
  return readers >= total ? "all" : "some";
}

/** "Seen by Ali, Sara and 2 others" — null when nobody has read it yet. */
export function seenByLabel(
  readerIds: string[],
  memberNames: Record<string, string>,
  max = 3,
): string | null {
  if (readerIds.length === 0) return null;
  const names = readerIds.map((id) => memberNames[id]?.trim() || "Someone");
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const list =
    shown.length === 1
      ? shown[0]
      : rest > 0
        ? shown.join(", ")
        : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  const tail = rest > 0 ? ` and ${rest} other${rest === 1 ? "" : "s"}` : "";
  return `Seen by ${list}${tail}`;
}

/**
 * Which own message should carry the "Seen by" line: the newest one that at
 * least one peer has read. Only groups show the line; 1:1 keeps the tick.
 */
export function seenByMessageId(
  messages: { id: string; authorId: string; createdAt: string }[],
  reads: PeerReads,
  currentMemberId: string,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.authorId !== currentMemberId) continue;
    if (readersOf(reads, m.createdAt).length > 0) return m.id;
  }
  return null;
}
