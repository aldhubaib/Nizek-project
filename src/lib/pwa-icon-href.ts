import type { BrandingStorageSlot } from "@/lib/branding-slots";

/**
 * Floor for icon path stamps. Existing uploads older than this are treated as
 * published at this instant so Chrome/iOS see a new `/pwa-icons/<stamp>/…`
 * URL on this deploy (query-string busting is not enough).
 *
 * Do not bump on routine deploys — that would re-prompt every installed app.
 * Bump only when we need to force a home-screen glyph refresh.
 */
export const PWA_ICON_FORCE_TOKEN = 1_788_050_000_000;

function stamp(updatedAt: number | null | undefined): string {
  if (!updatedAt || updatedAt <= 0) return "0";
  return String(Math.max(updatedAt, PWA_ICON_FORCE_TOKEN));
}

/** Same-origin PWA icon URL. Chrome treats icon src as immutable, so the
 * path (not a query string) must change whenever the uploaded artwork changes. */
export function pwaIconHref(
  file: string,
  updatedAt: number | null | undefined,
): string {
  const name = file.replace(/^\//, "");
  return `/pwa-icons/${stamp(updatedAt)}/${name}`;
}

export type PwaIconFileDef = {
  slot: BrandingStorageSlot;
  fallback: string;
  contentType: string;
};

/** Well-known filenames served at `/pwa-icons/{token}/{file}`. */
export const PWA_ICON_FILES: Record<string, PwaIconFileDef> = {
  "icon-192.png": {
    slot: "androidAny192",
    fallback: "icon-192.png",
    contentType: "image/png",
  },
  "icon-512.png": {
    slot: "androidAny512",
    fallback: "icon-512.png",
    contentType: "image/png",
  },
  "icon-maskable-192.png": {
    slot: "androidMaskable192",
    fallback: "icon-maskable-192.png",
    contentType: "image/png",
  },
  "icon-maskable-512.png": {
    slot: "androidMaskable512",
    fallback: "icon-maskable-512.png",
    contentType: "image/png",
  },
  "icon-monochrome.png": {
    slot: "androidMonochrome",
    fallback: "icon-512.png",
    contentType: "image/png",
  },
  "apple-touch-icon.png": {
    slot: "appleTouchIcon",
    fallback: "apple-touch-icon.png",
    contentType: "image/png",
  },
  "favicon.ico": {
    slot: "favicon",
    fallback: "favicon.ico",
    contentType: "image/x-icon",
  },
  "favicon-dark.ico": {
    slot: "faviconDark",
    fallback: "favicon.ico",
    contentType: "image/x-icon",
  },
};

/** Slots whose `updatedAt` bumps the PWA icon generation token. */
export const PWA_ICON_TOKEN_SLOTS: BrandingStorageSlot[] = [
  "favicon",
  "faviconDark",
  "appleTouchIcon",
  "androidAny192",
  "androidAny512",
  "androidMaskable192",
  "androidMaskable512",
  "androidMonochrome",
  "homeScreenSource",
  "webLogo",
];

export function pwaIconToken(
  times: Partial<Record<BrandingStorageSlot, { updatedAt: number } | undefined>>,
): number {
  const max = Math.max(
    0,
    ...PWA_ICON_TOKEN_SLOTS.map((s) => times[s]?.updatedAt ?? 0),
  );
  if (max <= 0) return 0;
  return Math.max(max, PWA_ICON_FORCE_TOKEN);
}
