import { cn } from "@/lib/utils";

type Size = "sm" | "md";

/*  4px-grid: sm = 16px, md = 20px diameter. */
const SIZE_CLASSES: Record<Size, string> = {
  sm: "min-w-4 h-4 text-xs px-1",
  md: "min-w-5 h-5 text-xs px-1",
};

interface CountBadgeProps {
  count: number;
  size?: Size;
  /** Muted style for "done / understood" states. */
  muted?: boolean;
  className?: string;
}

export function CountBadge({
  count,
  size = "md",
  muted,
  className,
}: CountBadgeProps) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold tabular-nums",
        SIZE_CLASSES[size],
        muted
          ? "bg-muted text-muted-foreground"
          : "bg-orange text-background",
        className,
      )}
    >
      {count}
    </span>
  );
}
