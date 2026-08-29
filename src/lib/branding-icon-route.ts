import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getBrandingMapUncached } from "@/lib/branding";
import type { BrandingStorageSlot } from "@/lib/branding-slots";
import { renderPwaFileFromSource } from "@/lib/pwa-icon-generate";

const NO_STORE = "no-store, max-age=0, must-revalidate";
const IMMUTABLE = "public, max-age=31536000, immutable";

export type BrandingIconCache = "no-store" | "immutable";

/**
 * Serve the live branding PNG/ICO as a same-origin 200.
 *
 * Chrome's WebAPK (the installed Android app) will not refresh the launcher
 * icon if the manifest points at a cross-origin URL or a 302. Proxy the
 * bytes so `/pwa-icons/<stamp>/icon-192.png` is a real image on this origin.
 */
async function fetchAssetBytes(url: string): Promise<Buffer | null> {
  try {
    const upstream = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!upstream.ok) return null;
    return Buffer.from(await upstream.arrayBuffer());
  } catch {
    return null;
  }
}

export async function brandingIconResponse(
  _req: Request,
  slot: BrandingStorageSlot,
  fallbackFile: string,
  contentType: string,
  cache: BrandingIconCache = "no-store",
): Promise<NextResponse> {
  const cacheControl = cache === "immutable" ? IMMUTABLE : NO_STORE;
  const map = await getBrandingMapUncached();
  const entry = map[slot];
  const appLogo = map.webLogo;
  if (
    appLogo &&
    appLogo.updatedAt > 0 &&
    appLogo.updatedAt >= (entry?.updatedAt ?? 0)
  ) {
    const source = await fetchAssetBytes(appLogo.url);
    const rendered = source
      ? await renderPwaFileFromSource(fallbackFile, source)
      : null;
    if (rendered) {
      return new NextResponse(new Uint8Array(rendered.bytes), {
        headers: {
          "Content-Type": rendered.contentType,
          "Cache-Control": cacheControl,
        },
      });
    }
  }
  if (entry) {
    try {
      const upstream = await fetch(entry.url, {
        cache: "no-store",
        redirect: "follow",
      });
      if (upstream.ok) {
        const buf = await upstream.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type":
              upstream.headers.get("content-type") || contentType,
            "Cache-Control": cacheControl,
          },
        });
      }
    } catch {
      // Fall through to the bundled default.
    }
  }

  try {
    const buf = await readFile(
      join(process.cwd(), "public", "branding-defaults", fallbackFile),
    );
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
    });
  } catch {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": NO_STORE },
    });
  }
}
