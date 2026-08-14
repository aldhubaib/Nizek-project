import { NextResponse } from "next/server";
import { brandingUrlWithBust, getBrandingMapUncached } from "@/lib/branding";
import type { BrandingStorageSlot } from "@/lib/branding-slots";

export const dynamic = "force-dynamic";

export async function GET() {
  const map = await getBrandingMapUncached();

  type Icon = { src: string; sizes: string; type: string; purpose?: string };

  const add = (
    slot: BrandingStorageSlot,
    sizes: string,
    fallback: string,
    purpose?: string,
  ): Icon => ({
    src: brandingUrlWithBust(map, slot) ?? fallback,
    sizes,
    type: "image/png",
    purpose,
  });

  // Always ship a complete icon set — custom branding overrides the static
  // fallbacks in /public, so the app stays installable before anything is set.
  const icons: Icon[] = [
    add("androidAny192", "192x192", "/icon-192.png", "any"),
    add("androidAny512", "512x512", "/icon-512.png", "any"),
    add("androidMaskable192", "192x192", "/icon-maskable-192.png", "maskable"),
    add("androidMaskable512", "512x512", "/icon-maskable-512.png", "maskable"),
  ];
  if (map.androidMonochrome) {
    icons.push({
      src: brandingUrlWithBust(map, "androidMonochrome")!,
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
