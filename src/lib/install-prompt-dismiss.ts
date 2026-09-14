export const INSTALL_PROMPT_DISMISSED_KEY = "nizek-install-dismissed-at";
export const INSTALL_PROMPT_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

/** Survives remounts even when localStorage is blocked. */
let dismissedAt = 0;

function readStored(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    return Number(localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function isInstallPromptDismissed(now = Date.now()): boolean {
  const at = Math.max(dismissedAt, readStored());
  return at > 0 && now < at + INSTALL_PROMPT_DISMISS_MS;
}

export function dismissInstallPrompt(now = Date.now()): void {
  dismissedAt = now;
  try {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, String(now));
  } catch {
    // Private mode / quota — in-memory flag still hides it this session.
  }
}

/** Test-only. */
export function resetInstallPromptDismiss(): void {
  dismissedAt = 0;
  try {
    localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
  } catch {
    // ignore
  }
}
