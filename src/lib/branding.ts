import "server-only";
import {
  unstable_cache,
  updateTag,
  revalidateTag,
  revalidatePath,
  refresh,
} from "next/cache";
import { prisma } from "@/lib/prisma";
import type { BrandingStorageSlot } from "@/lib/branding-slots";
import { pwaIconHref, pwaIconToken } from "@/lib/pwa-icon-href";

export type BrandingEntry = { url: string; updatedAt: number };
export type BrandingMap = Partial<Record<BrandingStorageSlot, BrandingEntry>>;

// Tag used to invalidate the cached branding read after any branding mutation.
export const BRANDING_CACHE_TAG = "branding";

// Cache the tiny BrandingAsset read so every page render (metadata + manifest +
// layout all call getBrandingMap) doesn't hit the DB. Bust with
// invalidateBrandingCache() after any branding mutation.
const getCachedBrandingRows = unstable_cache(
  async () => prisma.brandingAsset.findMany(),
  ["branding-map"],
  { tags: [BRANDING_CACHE_TAG], revalidate: 300 },
);

/** Drop the branding read cache and the root layout so favicons/manifest update. */
export function invalidateBrandingCache() {
  updateTag(BRANDING_CACHE_TAG);
  revalidateTag(BRANDING_CACHE_TAG, { expire: 0 });
  revalidatePath("/", "layout");
  revalidatePath("/manifest.json");
  revalidatePath("/dashboard/admin");
  refresh();
}

// Static fallbacks used before any custom asset is uploaded.
export const BRANDING_FALLBACKS: Partial<Record<BrandingStorageSlot, string>> = {
  favicon: "/favicon.ico",
  faviconDark: "/favicon.ico",
  webLogo: "/favicon.ico",
};

function rowsToMap(
  rows: { slot: string; url: string; updatedAt: Date }[],
): BrandingMap {
  const map: BrandingMap = {};
  for (const r of rows) {
    map[r.slot as BrandingStorageSlot] = {
      url: r.url,
      updatedAt: r.updatedAt.getTime(),
    };
  }
  return map;
}

/**
 * Current branding assets keyed by concrete storage slot. Reads the small
 * BrandingAsset table; returns {} on any error so metadata/manifest rendering
 * never fails because of branding.
 */
export async function getBrandingMap(): Promise<BrandingMap> {
  try {
    const rows = await getCachedBrandingRows();
    return rowsToMap(rows);
  } catch {
    return {};
  }
}

/**
 * Same as getBrandingMap but hits Postgres every time. Used by /api/version,
 * the PWA manifest, and /favicon.ico so a logo upload is visible immediately
 * even if another replica still has a warm 300s cache.
 */
export async function getBrandingMapUncached(): Promise<BrandingMap> {
  try {
    const rows = await prisma.brandingAsset.findMany();
    return rowsToMap(rows);
  } catch {
    return {};
  }
}

/**
 * URLs for the surfaces we live-apply in open clients.
 * Favicon / apple-touch / manifest use same-origin versioned paths.
 * webLogo / splash stay on R2 and are null when unset (letter-N fallback).
 */
export async function getLiveLogos(): Promise<
  import("@/lib/live-branding").LiveLogos
> {
  const map = await getBrandingMapUncached();
  const token = pwaIconToken(map);
  const pickR2 = (slot: "webLogo" | "iosSplash") => {
    const entry = map[slot];
    return entry ? withBrandingBust(entry.url, entry.updatedAt) : null;
  };
  return {
    favicon: pwaIconHref("favicon.ico", map.favicon?.updatedAt),
    faviconDark: map.faviconDark
      ? pwaIconHref("favicon-dark.ico", map.faviconDark.updatedAt)
      : null,
    appleTouchIcon: pwaIconHref(
      "apple-touch-icon.png",
      map.appleTouchIcon?.updatedAt,
    ),
    webLogo: pickR2("webLogo"),
    iosSplash: pickR2("iosSplash"),
    manifest: `/manifest.json?v=${token}`,
    iconToken: String(token),
  };
}

export function brandingUrl(
  map: BrandingMap,
  slot: BrandingStorageSlot,
): string | null {
  return map[slot]?.url ?? BRANDING_FALLBACKS[slot] ?? null;
}

/** Append a version query so browsers/CDNs don't keep serving a replaced asset. */
export function withBrandingBust(url: string, updatedAt: number): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${updatedAt}`;
}

export function brandingUrlWithBust(
  map: BrandingMap,
  slot: BrandingStorageSlot,
): string | null {
  const entry = map[slot];
  if (entry) return withBrandingBust(entry.url, entry.updatedAt);
  return BRANDING_FALLBACKS[slot] ?? null;
}

// Storage slot for the admin-configured custom notification sound. Stored in the
// same BrandingAsset table (singleton row) but kept out of BRANDING_SLOTS since
// it's audio, not an image with dimension/sharp validation.
export const NOTIFICATION_SOUND_SLOT = "notificationSound";

/**
 * URL of the admin-uploaded custom notification sound, or null if none is set.
 * Reuses the cached branding rows so it's cheap on every dashboard render.
 */
export async function getNotificationSoundUrl(): Promise<string | null> {
  try {
    const rows = await getCachedBrandingRows();
    return rows.find((r) => r.slot === NOTIFICATION_SOUND_SLOT)?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * A short token that changes whenever the notification sound changes. Read
 * UNCACHED on purpose so every replica reports the same value the instant the
 * sound is updated — it's folded into the app version to trip the update prompt,
 * and a per-replica cache would cause the version to flap between instances.
 */
export async function getNotificationSoundToken(): Promise<string> {
  try {
    const row = await prisma.brandingAsset.findUnique({
      where: { slot: NOTIFICATION_SOUND_SLOT },
      select: { updatedAt: true },
    });
    return row ? String(row.updatedAt.getTime()) : "0";
  } catch {
    return "0";
  }
}

/**
 * Uncached max(updatedAt) across every branding row. Kept for diagnostics;
 * image logos apply live and no longer fold into the app version.
 */
export async function getBrandingChangeToken(): Promise<string> {
  try {
    const rows = await prisma.brandingAsset.findMany({
      select: { updatedAt: true },
    });
    if (rows.length === 0) return "0";
    return String(Math.max(...rows.map((r) => r.updatedAt.getTime())));
  } catch {
    return "0";
  }
}
