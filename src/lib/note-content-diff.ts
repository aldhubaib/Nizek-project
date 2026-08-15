export type ParagraphChange = {
  type: "added" | "removed" | "changed";
  paragraph?: number;
  before?: string;
  after?: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

export function htmlToParagraphs(html: string): string[] {
  return stripHtml(html)
    .split("\n")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
}

/** True only when `b` is clearly an edit of `a`, not a different paragraph that shifted. */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < n && a[prefix] === b[prefix]) prefix++;
  if (prefix >= 24) return true;

  const wa = words(a);
  const wb = words(b);
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  const union = wa.size + wb.size - overlap;
  if (union === 0) return false;
  return overlap >= 3 && overlap / union >= 0.5;
}

function clip(text: string, max = 280): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function lcsAnchors(oldPs: string[], newPs: string[]): { oi: number; nj: number }[] {
  const n = oldPs.length;
  const m = newPs.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldPs[i] === newPs[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const anchors: { oi: number; nj: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldPs[i] === newPs[j]) {
      anchors.push({ oi: i, nj: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return anchors;
}

function diffHunk(
  oldHunk: string[],
  newHunk: string[],
  oldStart: number,
  newStart: number,
): ParagraphChange[] {
  if (oldHunk.length === 0) {
    return newHunk.map((p, i) => ({
      type: "added" as const,
      paragraph: newStart + i + 1,
      after: clip(p),
    }));
  }
  if (newHunk.length === 0) {
    return oldHunk.map((p, i) => ({
      type: "removed" as const,
      paragraph: oldStart + i + 1,
      before: clip(p),
    }));
  }
  if (oldHunk.length === 1 && newHunk.length === 1) {
    return [
      {
        type: "changed",
        paragraph: newStart + 1,
        before: clip(oldHunk[0]),
        after: clip(newHunk[0]),
      },
    ];
  }

  const usedNew = new Set<number>();
  const changes: ParagraphChange[] = [];
  oldHunk.forEach((oldP, oldIndex) => {
    const close = newHunk.findIndex((p, j) => !usedNew.has(j) && similar(oldP, p));
    if (close !== -1) {
      usedNew.add(close);
      changes.push({
        type: "changed",
        paragraph: newStart + close + 1,
        before: clip(oldP),
        after: clip(newHunk[close]),
      });
      return;
    }
    changes.push({
      type: "removed",
      paragraph: oldStart + oldIndex + 1,
      before: clip(oldP),
    });
  });
  newHunk.forEach((p, i) => {
    if (usedNew.has(i)) return;
    changes.push({ type: "added", paragraph: newStart + i + 1, after: clip(p) });
  });
  return changes;
}

export function diffNoteParagraphs(oldHtml: string, newHtml: string): ParagraphChange[] {
  const oldPs = htmlToParagraphs(oldHtml);
  const newPs = htmlToParagraphs(newHtml);
  const anchors = lcsAnchors(oldPs, newPs);
  const changes: ParagraphChange[] = [];

  let prevOi = 0;
  let prevNj = 0;
  for (const { oi, nj } of anchors) {
    changes.push(...diffHunk(oldPs.slice(prevOi, oi), newPs.slice(prevNj, nj), prevOi, prevNj));
    prevOi = oi + 1;
    prevNj = nj + 1;
  }
  changes.push(...diffHunk(oldPs.slice(prevOi), newPs.slice(prevNj), prevOi, prevNj));

  return changes.slice(0, 8);
}

export function summarizeContentDiff(changes: ParagraphChange[]): string {
  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const edited = changes.filter((c) => c.type === "changed").length;
  const parts: string[] = [];
  if (removed === 1) parts.push("Deleted a paragraph");
  else if (removed > 1) parts.push(`Deleted ${removed} paragraphs`);
  if (added === 1) parts.push("Added a paragraph");
  else if (added > 1) parts.push(`Added ${added} paragraphs`);
  if (edited === 1) parts.push("Edited a paragraph");
  else if (edited > 1) parts.push(`Edited ${edited} paragraphs`);
  if (parts.length === 0) return "Updated content";
  return parts.join(", ");
}

export function encodeContentDiff(changes: ParagraphChange[]): string {
  return JSON.stringify({ v: 1, changes });
}

export function decodeContentDiff(raw: string | null | undefined): ParagraphChange[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: number; changes?: ParagraphChange[] };
    if (!Array.isArray(parsed.changes)) return null;
    return parsed.changes;
  } catch {
    return null;
  }
}
