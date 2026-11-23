/**
 * Pure: how many chats need attention. A chat with four unread messages counts
 * once. Note-comment threads are excluded (phone inbox hides them).
 */
export function unreadChatCountFromMaps(input: {
  messageUnreads: Map<string, number>;
  noteCommentThreadIds: Iterable<string>;
  markedUnreadThreadIds?: Iterable<string>;
}): number {
  const notes = new Set(
    [...input.noteCommentThreadIds].map((id) => (id.startsWith("conv-") ? id : `conv-${id}`)),
  );
  const counted = new Set<string>();
  for (const [threadId, n] of input.messageUnreads) {
    if (n <= 0) continue;
    if (notes.has(threadId)) continue;
    counted.add(threadId);
  }
  for (const threadId of input.markedUnreadThreadIds ?? []) {
    if (!threadId || notes.has(threadId)) continue;
    counted.add(threadId);
  }
  return counted.size;
}
