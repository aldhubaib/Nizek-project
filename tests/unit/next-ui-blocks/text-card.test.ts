// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { opening } from "@/next-ui/blocks/text-card";
import { htmlToParagraphs, htmlToText, wordCount } from "@/next-ui/lib/safe-html";

/** A text card shows a note's opening the way it was written; these are the readers behind it. */

describe("htmlToParagraphs", () => {
  it("keeps each block as one paragraph, inline marks flattened, entities decoded", () => {
    const html = "<h2>Agenda</h2><p>We agreed on the <b>scope</b> &amp; the <a href='#'>budget</a>.</p><ul><li>One</li><li>Two&nbsp;items</li></ul>";
    expect(htmlToParagraphs(html)).toEqual(["Agenda", "We agreed on the scope & the budget.", "One", "Two items"]);
  });

  it("breaks on <br>, drops empty blocks and squeezes whitespace", () => {
    expect(htmlToParagraphs("<p>First line<br/>second line</p><p></p><p>  spaced   out </p>")).toEqual(["First line", "second line", "spaced out"]);
  });

  it("joins a table row into one line and gives nothing for nothing", () => {
    expect(htmlToParagraphs("<table><tr><td>a</td><td>b</td></tr></table>")).toEqual(["a b"]);
    expect(htmlToParagraphs(null)).toEqual([]);
    expect(htmlToParagraphs("")).toEqual([]);
  });

  it("reads the same words as the one-line text", () => {
    const html = "<p>Alpha <i>beta</i></p><p>gamma</p>";
    expect(htmlToParagraphs(html).join(" ")).toBe(htmlToText(html));
  });
});

describe("wordCount", () => {
  it("counts words, not spaces", () => {
    expect(wordCount("We agreed on the scope.")).toBe(5);
    expect(wordCount("  one   two  ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });
});

describe("opening", () => {
  it("passes short bodies through whole", () => {
    expect(opening(["a", "b"], 100)).toEqual(["a", "b"]);
  });

  it("stops at the budget, cutting the crossing paragraph on a word with an ellipsis", () => {
    const long = "the quick brown fox jumps over the lazy dog and keeps on running far away";
    const out = opening(["Short one.", long, "never shown"], 60);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe("Short one.");
    expect(out[1].endsWith("…")).toBe(true);
    expect(out[1].length).toBeLessThanOrEqual(51); // 60 − 10 used, plus the ellipsis
    expect(out[1]).not.toContain("far away");
  });

  it("leaves out a crossing paragraph when only a few characters are left", () => {
    expect(opening(["x".repeat(95), "another paragraph here"], 100)).toEqual(["x".repeat(95)]);
  });
});
