import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { BrandingStorageSlot } from "@/lib/branding-slots";

export type BrandingEntry = { url: string; updatedAt: number };
export type BrandingMap = Partial<Record<BrandingStorageSlot, BrandingEntry>>;

// Tag used to invalidate the cached branding read after any branding mutation.
export const BRANDING_CACHE_TAG = "branding";

// Cache the tiny BrandingAsset read so every page render (metadata + manifest +
// layout all call getBrandingMap) doesn't hit the DB. Invalidated via
// revalidateTag(BRANDING_CACHE_TAG) when branding assets change.
const getCachedBrandingRows = unstable_cache(
  async () => prisma.brandingAsset.findMany(),
  ["branding-map"],
  // Tagged for on-demand invalidation on branding change; revalidate is a
  // self-healing backstop so staleness is bounded even without the tag bust.
  { tags: [BRANDING_CACHE_TAG], revalidate: 300 },
);

// Static fallbacks used before any custom asset is uploaded.
export const BRANDING_FALLBACKS: Partial<Record<BrandingStorageSlot, string>> = {
  favicon: "/favicon.ico",
  faviconDark: "/favicon.ico",
  webLogo: "/favicon.ico",
};

/**
 * Current branding assets keyed by concrete storage slot. Reads the small
 * BrandingAsset table; returns {} on any error so metadata/manifest rendering
 * never fails because of branding.
 */
export async function getBrandingMap(): Promise<BrandingMap> {
  try {
    const rows = await getCachedBrandingRows();
    const map: BrandingMap = {};
    for (const r of rows) {
      map[r.slot as BrandingStorageSlot] = {
        url: r.url,
        updatedAt: r.updatedAt.getTime(),
      };
    }
    return map;
  } catch {
    return {};
  }
}

export function brandingUrl(
  map: BrandingMap,
  slot: BrandingStorageSlot,
): string | null {
  return map[slot]?.url ?? BRANDING_FALLBACKS[slot] ?? null;
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
