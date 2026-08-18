/** localStorage key for the last home-screen icon token the user acknowledged. */
export const HOME_SCREEN_ICON_TOKEN_KEY = "nizek-pwa-icon-token";

export type HomeScreenBannerAction = "hide" | "seed" | "show";

/**
 * Decide whether an installed PWA should prompt about a new home-screen icon.
 *
 * - Not standalone → hide (browser tabs already live-apply favicons).
 * - No stored token → seed (first open after this feature, or a fresh install).
 * - Token changed → show so the user can accept Chrome's identity update
 *   (or, on iOS, re-add if the shadow cache holds).
 */
export function decideHomeScreenBanner(opts: {
  currentToken: string | null;
  storedToken: string | null;
  standalone: boolean;
}): HomeScreenBannerAction {
  if (!opts.standalone) return "hide";
  if (!opts.currentToken || opts.currentToken === "0") return "hide";
  if (opts.storedToken == null) return "seed";
  if (opts.storedToken === opts.currentToken) return "hide";
  return "show";
}

export function isIosUserAgent(
  ua: string,
  platform?: string,
  maxTouchPoints?: number,
): boolean {
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch.
  return platform === "MacIntel" && (maxTouchPoints ?? 0) > 1;
}
