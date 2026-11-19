/** Own messages newer than this can be removed for the whole chat. Telegram uses 48 hours. */
export const DELETE_FOR_EVERYONE_MS = 48 * 60 * 60 * 1000;

export function canDeleteForEveryone(
  createdAt: Date | string,
  authorId: string,
  viewerId: string,
  now = Date.now(),
): boolean {
  if (authorId !== viewerId) return false;
  const at = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  return now - at <= DELETE_FOR_EVERYONE_MS;
}
