export function firstUnreadMessageId(
  messages: { id: string; authorId: string; createdAt: string | Date }[],
  currentMemberId: string,
  lastReadAt: string | Date | null | undefined,
): string | null {
  if (!lastReadAt) return null;
  const t = new Date(lastReadAt).getTime();
  if (!Number.isFinite(t)) return null;
  const found = messages.find(
    (m) =>
      m.authorId !== currentMemberId && new Date(m.createdAt).getTime() > t,
  );
  return found?.id ?? null;
}

export function formatUnreadSeparator(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "1 unread message" : `${count} unread messages`;
}
