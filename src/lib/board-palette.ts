/**
 * The colours a column or card type may be given.
 *
 * A fixed list rather than free input, and each entry spells its classes out
 * instead of interpolating one stem. Tailwind only emits classes it can find
 * written out in the source, so a `bg-${color}` assembled at runtime compiles
 * to nothing at all — the same reason `STATUS_COLOR` in `src/lib/task-label.ts`
 * is written the way it is.
 *
 * What is stored on the row is the `id`. Renaming a swatch or restyling one is
 * a change here and nowhere else.
 */

export interface BoardColor {
  id: string;
  label: string;
  /** Filled dot, for column headers and type chips. */
  dot: string;
  text: string;
  border: string;
  /** Faint wash behind a chip or column header. */
  soft: string;
}

export const BOARD_COLORS: BoardColor[] = [
  {
    id: "slate",
    label: "Slate",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    border: "border-muted-foreground/30",
    soft: "bg-muted-foreground/10",
  },
  {
    id: "green",
    label: "Green",
    dot: "bg-primary",
    text: "text-primary",
    border: "border-primary/30",
    soft: "bg-primary/10",
  },
  {
    id: "emerald",
    label: "Emerald",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    border: "border-emerald-400/30",
    soft: "bg-emerald-400/10",
  },
  {
    id: "cyan",
    label: "Cyan",
    dot: "bg-cyan",
    text: "text-cyan",
    border: "border-cyan/30",
    soft: "bg-cyan/10",
  },
  {
    id: "sky",
    label: "Sky",
    dot: "bg-sky",
    text: "text-sky",
    border: "border-sky/30",
    soft: "bg-sky/10",
  },
  {
    id: "violet",
    label: "Violet",
    dot: "bg-violet",
    text: "text-violet",
    border: "border-violet/30",
    soft: "bg-violet/10",
  },
  {
    id: "purple",
    label: "Purple",
    dot: "bg-purple",
    text: "text-purple",
    border: "border-purple/30",
    soft: "bg-purple/10",
  },
  {
    id: "fuchsia",
    label: "Fuchsia",
    dot: "bg-fuchsia-400",
    text: "text-fuchsia-400",
    border: "border-fuchsia-400/30",
    soft: "bg-fuchsia-400/10",
  },
  {
    id: "rose",
    label: "Rose",
    dot: "bg-rose-400",
    text: "text-rose-400",
    border: "border-rose-400/30",
    soft: "bg-rose-400/10",
  },
  {
    id: "red",
    label: "Red",
    dot: "bg-destructive",
    text: "text-destructive",
    border: "border-destructive/30",
    soft: "bg-destructive/10",
  },
  {
    id: "orange",
    label: "Orange",
    dot: "bg-orange",
    text: "text-orange",
    border: "border-orange/30",
    soft: "bg-orange/10",
  },
  {
    id: "amber",
    label: "Amber",
    dot: "bg-amber-400",
    text: "text-amber-400",
    border: "border-amber-400/30",
    soft: "bg-amber-400/10",
  },
  {
    id: "lime",
    label: "Lime",
    dot: "bg-lime-400",
    text: "text-lime-400",
    border: "border-lime-400/30",
    soft: "bg-lime-400/10",
  },
];

export const DEFAULT_BOARD_COLOR = "slate";

const BY_ID = new Map(BOARD_COLORS.map((color) => [color.id, color]));

/** Unknown ids fall back rather than render an uncoloured element. */
export function boardColor(id: string | null | undefined): BoardColor {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_BOARD_COLOR)!;
}

export function isBoardColor(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * Icons a card type may use, as lucide names.
 *
 * An allow-list because the stored value is looked up in a component map at
 * render time; anything outside this list would resolve to undefined and crash
 * the row it was on.
 */
export const BOARD_ICONS = [
  "Sparkles",
  "Wrench",
  "Bug",
  "AlertCircle",
  "Palette",
  "FileText",
  "Rocket",
  "Flag",
  "Star",
  "Zap",
  "Target",
  "CircleDot",
] as const;

export type BoardIcon = (typeof BOARD_ICONS)[number];

export const DEFAULT_BOARD_ICON: BoardIcon = "Sparkles";

export function isBoardIcon(name: string): name is BoardIcon {
  return (BOARD_ICONS as readonly string[]).includes(name);
}
