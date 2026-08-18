/** Wrap the first plaintext occurrence of `quote` in `html`, skipping tags. */
export function wrapFirstPlainText(
  html: string,
  quote: string,
  openTag: string,
  closeTag: string,
): string {
  const needle = quote.trim().replace(/\s+/g, " ");
  if (!needle || !html) return html;

  type Piece = { start: number; end: number; ch: string };
  const pieces: Piece[] = [];
  const ENTITY_MAP: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&nbsp;": " ",
    "&#39;": "'",
    "&apos;": "'",
  };
  const entities = Object.keys(ENTITY_MAP);
  const BLOCK = new Set([
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "ul", "ol", "blockquote", "br", "tr", "pre", "hr",
    "table", "thead", "tbody", "td", "th", "section", "article",
  ]);

  const pushChar = (start: number, end: number, ch: string) => {
    if (/\s/.test(ch)) {
      const last = pieces[pieces.length - 1];
      if (last?.ch === " ") {
        last.end = end;
        return;
      }
      pieces.push({ start, end, ch: " " });
      return;
    }
    pieces.push({ start, end, ch });
  };

  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === "<") {
      const gt = html.indexOf(">", i);
      if (gt === -1) break;
      const inner = html.slice(i + 1, gt).trim();
      const isClose = inner.startsWith("/");
      const name = inner.replace(/^\//, "").split(/[\s/]/)[0]?.toLowerCase() ?? "";
      if (BLOCK.has(name) && (isClose || name === "br")) {
        pushChar(i, gt, " ");
      }
      i = gt;
      continue;
    }
    if (ch === "&") {
      const hit = entities.find((e) => html.startsWith(e, i));
      if (hit) {
        pushChar(i, i + hit.length - 1, ENTITY_MAP[hit]);
        i += hit.length - 1;
        continue;
      }
    }
    pushChar(i, i, ch);
  }

  const collapsed = pieces.map((p) => p.ch).join("");
  const idx = collapsed.indexOf(needle);
  if (idx === -1) return html;

  const from = pieces[idx].start;
  const last = pieces[idx + needle.length - 1];
  if (!last) return html;
  const to = last.end + 1;

  // TipTap selections often span headings/lists. A single <mark> wrapping
  // those tags is invalid HTML and gets stripped — wrap each text run instead.
  let out = html.slice(0, from);
  let wrapping = false;
  let i = from;
  while (i < to) {
    if (html[i] === "<") {
      if (wrapping) {
        out += closeTag;
        wrapping = false;
      }
      const gt = html.indexOf(">", i);
      const end = gt === -1 ? html.length : gt + 1;
      out += html.slice(i, end);
      i = end;
      continue;
    }
    if (!wrapping) {
      out += openTag;
      wrapping = true;
    }
    out += html[i];
    i++;
  }
  if (wrapping) out += closeTag;
  return out + html.slice(to);
}

export function commentMarkTag(threadId: string): { open: string; close: string } {
  return {
    open: `<mark data-kind="comment" data-thread-id="${escapeAttr(threadId)}" class="note-annotation note-annotation-comment">`,
    close: "</mark>",
  };
}

export function taskMarkTag(taskId: string): { open: string; close: string } {
  return {
    open: `<mark data-kind="task" data-task-id="${escapeAttr(taskId)}" class="note-annotation note-annotation-task">`,
    close: "</mark>",
  };
}

export function applyStoredAnnotationMarks(
  content: string,
  taskLinks: { taskId: string; quoteText?: string | null }[],
  commentThreads: { id: string; quoteText?: string | null }[],
): string {
  let html = content;
  for (const link of taskLinks) {
    const quote = link.quoteText?.trim();
    if (!quote || html.includes(`data-task-id="${link.taskId}"`)) continue;
    const mark = taskMarkTag(link.taskId);
    html = wrapFirstPlainText(html, quote, mark.open, mark.close);
  }
  for (const thread of commentThreads) {
    const quote = thread.quoteText?.trim();
    if (!quote || html.includes(`data-thread-id="${thread.id}"`)) continue;
    const mark = commentMarkTag(thread.id);
    html = wrapFirstPlainText(html, quote, mark.open, mark.close);
  }
  return html;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** TipTap needs a document. Plain task descriptions become a paragraph. */
export function asAnnotatableHtml(value: string | null | undefined): string {
  const text = value ?? "";
  if (!text.trim()) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

export function plainTextExcerpt(html: string, max = 220): string {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
