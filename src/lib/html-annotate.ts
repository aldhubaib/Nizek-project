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

  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (inTag) {
      if (ch === ">") inTag = false;
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
  return html.slice(0, from) + openTag + html.slice(from, to) + closeTag + html.slice(to);
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
