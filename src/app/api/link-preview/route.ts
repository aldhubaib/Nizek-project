import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import type { LinkPreview } from "@/lib/link-preview";
import {
  assertSafePreviewUrl,
  LruTtlCache,
  readLimitedText,
  safeFetchWithRedirects,
  UnsafeUrlError,
} from "@/lib/link-preview-guard";

export const runtime = "nodejs";

const PREVIEW_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_CACHE_ENTRIES = 500;
const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 500_000;

const previewCache = new LruTtlCache<LinkPreview & { unavailable?: boolean }>(
  MAX_CACHE_ENTRIES,
  PREVIEW_TTL_MS,
);

function cachedJson(url: string, data: LinkPreview & { unavailable?: boolean }) {
  previewCache.set(url, data);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#x0*2F;/gi, "/")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function firstMatch(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) {
      const value = decodeEntities(m[1].trim());
      if (value) return value;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = await assertSafePreviewUrl(target);
  } catch (err) {
    const message = err instanceof UnsafeUrlError ? err.message : "Invalid url";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const cacheKey = parsed.toString();
  const cached = previewCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const fallback: LinkPreview = {
    url: parsed.toString(),
    siteName: host,
    title: host,
    description: null,
    image: null,
    favicon: `${parsed.origin}/favicon.ico`,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { res, finalUrl } = await safeFetchWithRedirects(parsed, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NizekBot/1.0; +https://nizek.app) link-preview",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      return cachedJson(cacheKey, { ...fallback, unavailable: true });
    }
    if (contentType.startsWith("image/")) {
      return cachedJson(cacheKey, { ...fallback, image: finalUrl.toString() });
    }
    if (!contentType.includes("html")) {
      return cachedJson(cacheKey, fallback);
    }

    const html = await readLimitedText(res, MAX_HTML_BYTES);

    const toAbsolute = (value: string | null): string | null => {
      if (!value) return null;
      try {
        const resolved = new URL(value, finalUrl.origin);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
        return resolved.toString();
      } catch {
        return null;
      }
    };

    const title =
      firstMatch(html, [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
        /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i,
        /<title[^>]*>([^<]*)<\/title>/i,
      ]) ?? host;

    const description = firstMatch(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    ]);

    const image = toAbsolute(
      firstMatch(html, [
        /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']*)["']/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
        /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["']/i,
      ]),
    );

    const siteName =
      firstMatch(html, [
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i,
      ]) ?? host;

    const favicon =
      toAbsolute(
        firstMatch(html, [
          /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']*)["']/i,
          /<link[^>]+href=["']([^"']*)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i,
          /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i,
          /<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
        ]),
      ) ?? `${finalUrl.origin}/favicon.ico`;

    const preview: LinkPreview = {
      url: parsed.toString(),
      title,
      description,
      image,
      siteName,
      favicon,
    };
    return cachedJson(cacheKey, preview);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return cachedJson(cacheKey, { ...fallback, unavailable: true });
  } finally {
    clearTimeout(timeout);
  }
}
