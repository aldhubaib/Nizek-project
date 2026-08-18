/**
 * WhatsApp-style swipe-right-to-reply. Must be a deliberate horizontal swipe
 * so vertical scrolling and iOS keyboard/viewport jumps don't attach a reply.
 */
export function shouldCommitSwipeReply(dx: number, dy: number): boolean {
  if (dx < 72) return false;
  if (Math.abs(dy) * 2 >= dx) return false;
  return true;
}
