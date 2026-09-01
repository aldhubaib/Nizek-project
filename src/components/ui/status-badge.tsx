import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BadgeConfig {
  label: string;
  color: string;
  bg: string;
}

type Size = "xs" | "sm" | "md" | "lg";

/*  4px-grid scale — heights land on 16 / 20 / 24 / 32 px.
 *  ┌──────┬────────┬────────┬────────┬─────────┐
 *  │ size │  font  │   px   │   py   │ ~height │
 *  ├──────┼────────┼────────┼────────┼─────────┤
 *  │  xs  │ text-xs│  6 px  │  2 px  │  16 px  │
 *  │  sm  │ text-xs│  8 px  │  4 px  │  20 px  │
 *  │  md  │ text-xs│ 12 px  │  6 px  │  24 px  │
 *  │  lg  │ text-s │ 16 px  │  8 px  │  32 px  │
 *  └──────┴────────┴────────┴────────┴─────────┘  */
const SIZE_CLASSES: Record<Size, string> = {
  xs: "text-xs px-1.5 py-0.5 font-semibold gap-1",
  sm: "text-xs px-2 py-1 font-semibold gap-1",
  md: "text-xs px-3 py-1.5 font-semibold gap-1.5",
  lg: "text-s px-4 py-2 font-semibold gap-1.5",
};

const ICON_SIZE: Record<Size, string> = {
  xs: "h-2.5 w-2.5",
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

const DOT_SIZE: Record<Size, string> = {
  xs: "h-1.5 w-1.5",
  sm: "h-2 w-2",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

interface StatusBadgeProps {
  size?: Size;
  config?: BadgeConfig;
  /** Leading icon component. */
  icon?: LucideIcon;
  /** Show a colored dot indicator instead of / in addition to an icon. */
  dot?: boolean;
  /** Dot color override (Tailwind bg class). Falls back to the config's text color mapped to bg. */
  dotColor?: string;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}

export function StatusBadge({
  size = "md",
  config,
  icon: Icon,
  dot,
  dotColor,
  children,
  className,
  title,
}: StatusBadgeProps) {
  const label = children ?? config?.label;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border",
        SIZE_CLASSES[size],
        config?.bg,
        config?.color,
        className,
      )}
      title={title}
    >
      {dot && (
        <span
          className={cn(
            "shrink-0 rounded-full",
            DOT_SIZE[size],
            dotColor ?? "bg-current",
          )}
        />
      )}
      {Icon && <Icon className={cn("shrink-0", ICON_SIZE[size])} />}
      {label}
    </span>
  );
}
