"use client";

import {
  AlertCircle,
  Bug,
  CircleDot,
  FileText,
  Flag,
  Palette,
  Rocket,
  Sparkles,
  Star,
  Target,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { BOARD_ICONS, DEFAULT_BOARD_ICON } from "@/lib/board-palette";

/**
 * The icons a card type may wear.
 *
 * A closed map rather than a dynamic lookup on the lucide package: the name is
 * stored as text, and anything not in this map would resolve to undefined and
 * crash the row it was rendered on. `BOARD_ICONS` is the same list as data, and
 * the test below keeps the two from drifting apart.
 */
const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Wrench,
  Bug,
  AlertCircle,
  Palette,
  FileText,
  Rocket,
  Flag,
  Star,
  Zap,
  Target,
  CircleDot,
};

export function boardIconComponent(name: string | null | undefined): LucideIcon {
  return (name ? ICONS[name] : undefined) ?? ICONS[DEFAULT_BOARD_ICON];
}

/** Every name in the palette resolves; exported so a test can assert it. */
export const BOARD_ICON_NAMES = BOARD_ICONS;

export function BoardIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = boardIconComponent(name);
  return <Icon className={className} />;
}
