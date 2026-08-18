/**
 * Client-safe helpers for the in-app update flow.
 *
 * Releases are compared by `releasedAt` (a monotonic timestamp), never by git
 * SHA. During a rolling deploy, `/api/version` may hit an older replica; we
 * keep the newest target we have seen and ignore regressions.
 */

export const APP_UPDATE_STORAGE_KEY = "nizek:app-update";
export const APP_UPDATE_CACHE_PARAM = "_v";
export const APP_UPDATE_MAX_ATTEMPTS = 3;
export const NOTIF_SOUND_CACHE = "notif-sound-v1";

export type AppRelease = {
  version: string;
  releasedAt: number;
};

export type StoredUpdate = AppRelease & { attempts: number };

export function computeReleasedAt(
  buildTimeMs: number,
  brandingTokenMs: number,
): number {
  const build = Number.isFinite(buildTimeMs) && buildTimeMs > 0 ? buildTimeMs : 0;
  const branding =
    Number.isFinite(brandingTokenMs) && brandingTokenMs > 0 ? brandingTokenMs : 0;
  return Math.max(build, branding);
}

export function isNewerRelease(
  incoming: AppRelease,
  baseline: AppRelease,
): boolean {
  return incoming.releasedAt > baseline.releasedAt;
}

/** Incoming wins only if it is strictly newer; otherwise keep current. */
export function pickLatest(
  current: AppRelease | null,
  incoming: AppRelease,
): AppRelease {
  if (!current) return incoming;
  return isNewerRelease(incoming, current) ? incoming : current;
}

export function isCaughtUp(page: AppRelease, live: AppRelease): boolean {
  return page.version === live.version || !isNewerRelease(live, page);
}

/**
 * Fold a poll result into the pending target.
 *
 * An older replica must not hide or replace a newer pending target. Returns
 * null when the page is already on the latest known release (hide the prompt).
 */
export function applyPoll(
  page: AppRelease,
  pending: AppRelease | null,
  live: AppRelease,
): AppRelease | null {
  const latest = pickLatest(pending, live);
  if (isCaughtUp(page, latest)) return null;
  return isNewerRelease(latest, page) ? latest : null;
}

export type UpdateMountAction =
  | { type: "caught_up" }
  | { type: "silent_retry"; target: StoredUpdate }
  | { type: "show_banner"; target: StoredUpdate }
  | { type: "idle" };

export function decideMountAction(
  page: AppRelease,
  stored: StoredUpdate | null,
  maxAttempts = APP_UPDATE_MAX_ATTEMPTS,
): UpdateMountAction {
  if (!stored) return { type: "idle" };
  if (isCaughtUp(page, stored)) return { type: "caught_up" };
  if (stored.attempts >= maxAttempts) {
    return { type: "show_banner", target: stored };
  }
  return {
    type: "silent_retry",
    target: { ...stored, attempts: stored.attempts + 1 },
  };
}

export function parseRelease(data: unknown): AppRelease | null {
  if (!data || typeof data !== "object") return null;
  const v = data as { version?: unknown; releasedAt?: unknown };
  if (typeof v.version !== "string" || !v.version) return null;
  const releasedAt =
    typeof v.releasedAt === "number" ? v.releasedAt : Number(v.releasedAt);
  return {
    version: v.version,
    releasedAt: Number.isFinite(releasedAt) && releasedAt > 0 ? releasedAt : 0,
  };
}

export function parseStoredUpdate(raw: string | null): StoredUpdate | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredUpdate>;
    if (typeof v.version !== "string" || !v.version) return null;
    if (typeof v.releasedAt !== "number" || !Number.isFinite(v.releasedAt)) {
      return null;
    }
    return {
      version: v.version,
      releasedAt: v.releasedAt,
      attempts:
        typeof v.attempts === "number" && v.attempts > 0 ? v.attempts : 0,
    };
  } catch {
    return null;
  }
}

export function withCacheBust(href: string, version: string): string {
  const url = new URL(href);
  url.searchParams.set(APP_UPDATE_CACHE_PARAM, version);
  return url.toString();
}

export function stripCacheBust(href: string): string {
  const url = new URL(href);
  if (!url.searchParams.has(APP_UPDATE_CACHE_PARAM)) return href;
  url.searchParams.delete(APP_UPDATE_CACHE_PARAM);
  return url.toString();
}

export function shouldSkipUpdateCheck(version: string): boolean {
  return version === "dev" || version.startsWith("dev.");
}
