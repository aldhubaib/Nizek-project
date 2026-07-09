import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import type { LinkPreview } from "@/lib/link-preview";

export const runtime = "nodejs";

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
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NizekBot/1.0; +https://nizek.app) link-preview",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      return NextResponse.json({ ...fallback, unavailable: true });
    }
    if (contentType.startsWith("image/")) {
      return NextResponse.json({ ...fallback, image: parsed.toString() });
    }
    if (!contentType.includes("html")) {
      return NextResponse.json(fallback);
    }

    const html = (await res.text()).slice(0, 500_000);

    const toAbsolute = (value: string | null): string | null => {
      if (!value) return null;
      try {
        return new URL(value, parsed.origin).toString();
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
      ) ?? `${parsed.origin}/favicon.ico`;

    const preview: LinkPreview = {
      url: parsed.toString(),
      title,
      description,
      image,
      siteName,
      favicon,
    };
    return NextResponse.json(preview);
  } catch {
    return NextResponse.json({ ...fallback, unavailable: true });
  }
}
