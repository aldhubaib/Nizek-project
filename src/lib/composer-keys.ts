// Enter-to-send policy shared by the chat and comment composers.
//
// Desktop (a mouse/trackpad, i.e. a real keyboard): Enter sends, Shift+Enter
// starts a new line — what Slack and WhatsApp Web do, and what the team asked
// for after Enter was turned into a plain newline. Phones and tablets keep
// Enter as a newline because the on-screen keyboard's return key is the only
// way to break a line there; the Send button sends. Ctrl/Cmd+Enter sends
// everywhere (external keyboards on tablets).

export type ComposerKeyEvent = {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** True mid-IME composition (Arabic/Japanese candidates); never send then. */
  isComposing?: boolean;
};

export function shouldSendOnEnter(e: ComposerKeyEvent, finePointer: boolean): boolean {
  if (e.key !== "Enter") return false;
  if (e.isComposing) return false;
  if (e.ctrlKey || e.metaKey) return true;
  if (e.shiftKey || e.altKey) return false;
  return finePointer;
}

/** Media query that distinguishes keyboard-and-mouse devices from touch. */
export const FINE_POINTER_QUERY = "(pointer: fine)";

/** Snapshot of the pointer type; false during SSR so phones never default to send. */
export function hasFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(FINE_POINTER_QUERY).matches;
  } catch {
    return false;
  }
}
