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
