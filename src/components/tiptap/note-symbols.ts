/** Glyphs notes commonly put on headings — checks, crosses, arrows, marks. */
export type NoteSymbol = {
  glyph: string;
  label: string;
  aliases: string[];
};

export const NOTE_SYMBOLS: NoteSymbol[] = [
  { glyph: "✅", label: "Check", aliases: ["yes", "done", "working", "ok", "tick"] },
  { glyph: "❌", label: "Cross", aliases: ["no", "missing", "x", "wrong", "fail"] },
  { glyph: "⚠️", label: "Warning", aliases: ["caution", "alert"] },
  { glyph: "⭐", label: "Star", aliases: ["favorite", "important"] },
  { glyph: "💡", label: "Idea", aliases: ["tip", "light"] },
  { glyph: "ℹ️", label: "Info", aliases: ["information"] },
  { glyph: "❗", label: "Exclamation", aliases: ["important"] },
  { glyph: "❓", label: "Question", aliases: ["help"] },
  { glyph: "🔥", label: "Fire", aliases: ["hot", "priority"] },
  { glyph: "📌", label: "Pin", aliases: ["note"] },
  { glyph: "🎯", label: "Target", aliases: ["goal"] },
  { glyph: "👍", label: "Thumbs up", aliases: ["yes", "good"] },
  { glyph: "👎", label: "Thumbs down", aliases: ["no", "bad"] },
  { glyph: "➡️", label: "Right arrow", aliases: ["arrow", "next"] },
  { glyph: "⬅️", label: "Left arrow", aliases: ["arrow", "back"] },
  { glyph: "⬆️", label: "Up arrow", aliases: ["arrow"] },
  { glyph: "⬇️", label: "Down arrow", aliases: ["arrow"] },
  { glyph: "☑️", label: "Checked box", aliases: ["checkbox", "tick"] },
  { glyph: "☐", label: "Empty box", aliases: ["checkbox", "todo"] },
  { glyph: "✔️", label: "Tick", aliases: ["check", "yes"] },
  { glyph: "✖️", label: "Multiply", aliases: ["x", "cross"] },
  { glyph: "➕", label: "Plus", aliases: ["add"] },
  { glyph: "➖", label: "Minus", aliases: ["subtract"] },
  { glyph: "🟢", label: "Green", aliases: ["go", "ok"] },
  { glyph: "🟡", label: "Yellow", aliases: ["wait"] },
  { glyph: "🔴", label: "Red", aliases: ["stop", "alert"] },
  { glyph: "📝", label: "Memo", aliases: ["note", "write"] },
  { glyph: "🔗", label: "Link", aliases: ["url"] },
  { glyph: "📎", label: "Paperclip", aliases: ["attach"] },
  { glyph: "•", label: "Bullet", aliases: ["dot"] },
  { glyph: "—", label: "Em dash", aliases: ["dash"] },
];

export function filterNoteSymbols(query: string): NoteSymbol[] {
  const q = query.trim().toLowerCase();
  if (!q) return NOTE_SYMBOLS;
  return NOTE_SYMBOLS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.glyph.includes(q) ||
      item.aliases.some((alias) => alias.includes(q)),
  );
}
