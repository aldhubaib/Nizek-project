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
