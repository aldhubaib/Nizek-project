"use client";

import * as React from "react";
import DOMPurify from "dompurify";

import { cn } from "@/next-ui/lib/cn";
import { useHydrated } from "@/next-ui/panes/use-hydrated";

/** The few entities the editor writes, back to characters. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Note bodies and task descriptions are editor HTML; this is the plain text for a preview line. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      // a block's end is a word break; an inline tag (bold, a link) is not
      .replace(/<\/(p|div|h[1-6]|li|tr|td|th|blockquote|pre)>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The same HTML as its blocks of plain text, in order: each paragraph, heading, list item or
 * table row is one string, empty ones left out. For a card that shows the opening of a note
 * the way it was written, not as one run-on line.
 */
export function htmlToParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((block) => decodeEntities(block).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** How many words the text has, for a "744 words" line. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** The first `max` characters of the text, cut on a word with an ellipsis. */
export function excerpt(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

let hooked = false;

/** Cleans the markup and makes every link open in a new tab. Browser only. */
export function sanitize(html: string): string {
  if (!hooked) {
    hooked = true;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
  }
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ["target"] });
}

/**
 * Editor HTML rendered read-only. The markup is cleaned in the browser first (DOMPurify), so a
 * stored body can carry no script; links open in a new tab. Empty until hydrated: the cleaner
 * needs a DOM, and the query that brings the HTML runs on the client anyway.
 */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const hydrated = useHydrated();
  const clean = React.useMemo(() => (hydrated ? sanitize(html) : null), [hydrated, html]);
  if (clean === null) return <div className={cn("min-h-6", className)} aria-busy />;
  return (
    <div
      className={cn("prose prose-sm prose-invert max-w-none break-words [&_a]:underline-offset-2", className)}
      dir="auto"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
