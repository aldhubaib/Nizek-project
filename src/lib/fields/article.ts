/**
 * Bilingual article field. Stored on CustomFieldValue as
 * `{ en: html, ar: html }`. Required is met when either language has text.
 */

export const ARTICLE_LANGS = ["en", "ar"] as const;
export type ArticleLang = (typeof ARTICLE_LANGS)[number];

export type ArticleValue = {
  en: string;
  ar: string;
};

export const EMPTY_ARTICLE: ArticleValue = { en: "", ar: "" };

export function isArticleLang(value: string): value is ArticleLang {
  return (ARTICLE_LANGS as readonly string[]).includes(value);
}

export function articleTextFromHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function articleHtmlHasContent(html: string | null | undefined): boolean {
  return articleTextFromHtml(html).length > 0;
}

export function parseArticleValue(raw: string | null | undefined): ArticleValue {
  if (!raw || !raw.trim()) return { ...EMPTY_ARTICLE };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return articleHtmlHasContent(raw) ? { en: raw, ar: "" } : { ...EMPTY_ARTICLE };
    }
    const row = parsed as { en?: unknown; ar?: unknown };
    return {
      en: typeof row.en === "string" ? row.en : "",
      ar: typeof row.ar === "string" ? row.ar : "",
    };
  } catch {
    return articleHtmlHasContent(raw) ? { en: raw, ar: "" } : { ...EMPTY_ARTICLE };
  }
}

export function stringifyArticleValue(value: ArticleValue): string {
  const en = value.en ?? "";
  const ar = value.ar ?? "";
  if (!articleHtmlHasContent(en) && !articleHtmlHasContent(ar)) return "";
  return JSON.stringify({ en, ar });
}

/** Blueprint / form required: English or Arabic has writing. */
export function articleFieldIsFilled(raw: string | null | undefined): boolean {
  const value = parseArticleValue(raw);
  return articleHtmlHasContent(value.en) || articleHtmlHasContent(value.ar);
}

function excerpt(text: string, max = 80): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Short value for cards and lists. */
export function formatArticleField(raw: string | null | undefined): string {
  const value = parseArticleValue(raw);
  const text = articleTextFromHtml(value.en) || articleTextFromHtml(value.ar);
  return excerpt(text);
}

export function formatArticleFieldDetail(raw: string | null | undefined): string {
  const value = parseArticleValue(raw);
  const langs = [
    articleHtmlHasContent(value.en) ? "English" : null,
    articleHtmlHasContent(value.ar) ? "Arabic" : null,
  ].filter(Boolean);
  if (langs.length === 0) return "";
  const text = articleTextFromHtml(value.en) || articleTextFromHtml(value.ar);
  return `${langs.join(" + ")} · ${excerpt(text, 120)}`;
}
