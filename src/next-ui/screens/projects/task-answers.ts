/**
 * The answers a task's questions hold, read from the strings the live panel stores: files as
 * `name::url|||name::url`, a client question as JSON `{needed, note, completed, completedAt}`,
 * a multi-select as a JSON array, a link as its URL, and everything else as plain text.
 */

export type Answer =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "link"; url: string }
  | { kind: "choices"; values: string[] }
  | { kind: "files"; files: { name: string; url: string }[] }
  | { kind: "client"; needed: boolean; note: string; completed: boolean; completedAt: string | null };

export function parseAnswer(question: { type: string; multiple?: boolean | null }, raw: string | null | undefined): Answer {
  const value = raw ?? "";
  if (question.type === "client") {
    if (!value) return { kind: "empty" };
    try {
      const p = JSON.parse(value) as { needed?: boolean | null; note?: string; completed?: boolean; completedAt?: string | null };
      if (p.needed == null) return { kind: "empty" };
      return {
        kind: "client",
        needed: p.needed,
        note: p.note ?? "",
        completed: Boolean(p.completed),
        completedAt: typeof p.completedAt === "string" ? p.completedAt : null,
      };
    } catch {
      return { kind: "empty" };
    }
  }
  if (!value.trim()) return { kind: "empty" };
  if (question.type === "file") {
    const files = value
      .split("|||")
      .filter(Boolean)
      .map((entry) => {
        const sep = entry.indexOf("::");
        return sep > -1 ? { name: entry.slice(0, sep), url: entry.slice(sep + 2) } : { name: entry, url: "" };
      });
    return files.length ? { kind: "files", files } : { kind: "empty" };
  }
  if (question.type === "link") return { kind: "link", url: value };
  if (question.type === "select" && question.multiple) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const values = parsed.map(String).filter(Boolean);
        return values.length ? { kind: "choices", values } : { kind: "empty" };
      }
    } catch {
      // a single legacy value
    }
    return { kind: "choices", values: [value] };
  }
  return { kind: "text", text: value };
}

/** True when the answer counts as given, the way the road map decides Missing data. */
export function isAnswered(a: Answer): boolean {
  return a.kind !== "empty";
}
