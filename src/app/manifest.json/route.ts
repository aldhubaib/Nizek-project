import { NextResponse } from "next/server";
import { getBrandingMapUncached } from "@/lib/branding";
import type { BrandingStorageSlot } from "@/lib/branding-slots";
import { pwaIconHref } from "@/lib/pwa-icon-href";

export const dynamic = "force-dynamic";

export async function GET() {
  const map = await getBrandingMapUncached();

  type Icon = { src: string; sizes: string; type: string; purpose?: string };

  const add = (
    slot: BrandingStorageSlot,
    sizes: string,
    path: string,
    purpose?: string,
  ): Icon => ({
    src: pwaIconHref(path, map[slot]?.updatedAt),
    sizes,
    type: "image/png",
    purpose,
  });

  // Same-origin, versioned paths. Chrome treats icon URLs as immutable, so a
  // new `?v=` after a logo upload is what actually refreshes the WebAPK glyph.
  const icons: Icon[] = [
    add("androidAny192", "192x192", "/icon-192.png", "any"),
    add("androidAny512", "512x512", "/icon-512.png", "any"),
    add("androidMaskable192", "192x192", "/icon-maskable-192.png", "maskable"),
    add("androidMaskable512", "512x512", "/icon-maskable-512.png", "maskable"),
  ];
  if (map.androidMonochrome) {
    icons.push({
      src: pwaIconHref("/icon-monochrome.png", map.androidMonochrome.updatedAt),
      sizes: "512x512",
      type: "image/png",
      purpose: "monochrome",
    });
  }

  return NextResponse.json(
    {
      id: "/",
      name: "Nizek Project",
      short_name: "Nizek",
      description: "Project management for teams",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: "#000000",
      theme_color: "#000000",
      icons,
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
