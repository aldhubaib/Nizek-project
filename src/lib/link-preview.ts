export type LinkPreview = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
  favicon?: string | null;
  /** Set when metadata couldn't be fetched — the client renders a bare link chip. */
  unavailable?: boolean;
};

// Matches http(s) URLs. Trailing punctuation is trimmed by the callers.
const URL_RE = /(https?:\/\/[^\s<]+)/gi;

function trimTrailing(url: string): string {
  return url.replace(/[)\].,;:!?'"]+$/, "");
}

export function extractUrls(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    const u = trimTrailing(m[1]);
    if (u.length > 8 && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

export function firstUrl(text: string): string | null {
  return extractUrls(text)[0] ?? null;
}

export type TextSegment =
  | { text: string; url?: undefined }
  | { text: string; url: string };

/**
 * Splits text into plain runs and links, keeping the original characters in
 * order so the result still reads as what was typed.
 *
 * Punctuation that trails a URL is handed back as plain text rather than
 * swallowed into the href — a sentence ending "see https://x.com." shouldn't
 * link to a full stop.
 */
export function splitByUrl(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  URL_RE.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_RE.exec(text)) !== null) {
    const url = trimTrailing(match[1]);
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index) });
    }
    segments.push({ text: url, url });
    cursor = match.index + url.length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
