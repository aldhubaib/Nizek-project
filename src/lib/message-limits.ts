// Single source of truth for chat message size limits. Shared by the composer
// (counter + block), the server action (hard check with a readable error) and
// the voice recorder (auto-stop).
//
// "Long messages cannot be sent" was reported by the team while no limit
// existed anywhere in the code — so the failure was never a size cap, and the
// user only ever saw a generic "Failed to send". These limits exist to make
// the boundary explicit, and every failed send is now logged with its size
// (server: sendMessage; client: POST /api/messages/failure) so the real cause
// shows up in the logs instead of in a complaint.

/** Hard cap on the stored message body (includes @[Name](id) mention tokens). */
export const MAX_MESSAGE_CHARS = 20_000;

/** The composer starts showing a character counter from here. */
export const MESSAGE_COUNTER_FROM = 18_000;

/** Voice notes stop recording automatically at this length. */
export const MAX_VOICE_NOTE_MS = 10 * 60 * 1000;

/** Opus at 32 kbps is transparent for speech and keeps a 10-minute note ~2.4 MB. */
export const VOICE_NOTE_BITS_PER_SECOND = 32_000;

export function messageTooLongError(length: number): string {
  return `Message is too long (${length.toLocaleString()} of ${MAX_MESSAGE_CHARS.toLocaleString()} characters). Split it into two messages or attach it as a file.`;
}
