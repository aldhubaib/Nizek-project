import { NextResponse } from "next/server";
import { getBrandingMap } from "@/lib/branding";
import type { BrandingStorageSlot } from "@/lib/branding-slots";

export const dynamic = "force-dynamic";

export async function GET() {
  const map = await getBrandingMap();

  const icons: {
    src: string;
    sizes: string;
    type: string;
    purpose?: string;
  }[] = [];

  const add = (slot: BrandingStorageSlot, sizes: string, purpose?: string) => {
    const entry = map[slot];
    if (entry) icons.push({ src: entry.url, sizes, type: "image/png", purpose });
  };

  add("androidAny192", "192x192", "any");
  add("androidAny512", "512x512", "any");
  add("androidMaskable192", "192x192", "maskable");
  add("androidMaskable512", "512x512", "maskable");
  add("androidMonochrome", "512x512", "monochrome");

  return NextResponse.json(
    {
      name: "Nizek Project",
      short_name: "Nizek",
      start_url: "/dashboard",
      display: "standalone",
      background_color: "#000000",
      theme_color: "#000000",
      icons,
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
