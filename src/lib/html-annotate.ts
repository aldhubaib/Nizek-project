/** Wrap the first contiguous plaintext occurrence of `quote` in `html`. */
export function wrapFirstPlainText(
  html: string,
  quote: string,
  openTag: string,
  closeTag: string,
): string {
  const needle = quote.trim();
  if (!needle || !html) return html;

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
    if (html.startsWith(needle, i)) {
      return (
        html.slice(0, i) + openTag + needle + closeTag + html.slice(i + needle.length)
      );
    }
  }
  return html;
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
