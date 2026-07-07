import "server-only";
import { prisma } from "@/lib/prisma";
import type { BrandingStorageSlot } from "@/lib/branding-slots";

export type BrandingEntry = { url: string; updatedAt: number };
export type BrandingMap = Partial<Record<BrandingStorageSlot, BrandingEntry>>;

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
    const rows = await prisma.brandingAsset.findMany();
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
