"use client";

import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OverflowTabItem<T extends string = string> = {
  id: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  count?: number;
};

const GAP = 8;
const MORE_SIZE = 32;

function tabLabel(item: OverflowTabItem<string>) {
  if (item.count != null && item.count > 0) return `${item.label} ${item.count}`;
  return item.label;
}

function fitVisibleCount(widths: number[], available: number) {
  if (widths.length === 0) return 0;
  const all =
    widths.reduce((sum, width) => sum + width, 0) + GAP * (widths.length - 1);
  if (all <= available) return widths.length;

  const budget = available - MORE_SIZE - GAP;
  let used = 0;
  let count = 0;
  for (const width of widths) {
    const next = count === 0 ? width : used + GAP + width;
    if (next > budget) break;
    used = next;
    count += 1;
  }
  return Math.max(1, Math.min(count, widths.length - 1));
}

const pillClassName =
  "inline-flex h-8 shrink-0 appearance-none items-center rounded-full px-3.5 text-s font-medium leading-none whitespace-nowrap";

function Pill({
  item,
  selected,
  onClick,
}: {
  item: OverflowTabItem<string>;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        pillClassName,
        "transition-colors",
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      )}
    >
      <span className="text-s font-medium leading-none">{tabLabel(item)}</span>
    </button>
  );
}

/**
 * Circular caret that holds filters the bar does not have room for.
 * Same control on mobile and desktop — only the hidden set changes with width.
 */
export function MoreTabsButton<T extends string>({
  items,
  value,
  onChange,
}: {
  items: OverflowTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  if (items.length === 0) return null;
  const active = items.some((item) => item.id === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More filters"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
          active && "bg-primary/20 text-primary",
        )}
      >
        <span
          aria-hidden
          className="mt-px block h-0 w-0 border-x-[4.5px] border-t-[5.5px] border-x-transparent border-t-current"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 rounded-xl py-1.5">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-lg px-3 py-2",
              item.id === value && "bg-accent",
            )}
          >
            <span className="flex-1">{tabLabel(item)}</span>
            {item.id === value ? <Check className="h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * WhatsApp-style filter chips. Leading pills stay in the row; anything that
 * does not fit — including Important on the desktop inbox sidebar — goes into
 * `MoreTabsButton`. Desktop and mobile share this measurement.
 */
export function OverflowTabBar<T extends string>({
  items,
  value,
  onChange,
  className,
  mobileMaxVisible,
}: {
  items: OverflowTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Below `lg`, show at most this many pills. `1` keeps the active pill + More. */
  mobileMaxVisible?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023px)").matches,
  );
  const [visibleCount, setVisibleCount] = useState(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches &&
      mobileMaxVisible != null
    ) {
      return Math.min(mobileMaxVisible, items.length);
    }
    return items.length > 4 ? 4 : items.length;
  });

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const cap =
    isMobile && mobileMaxVisible != null ? mobileMaxVisible : null;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => {
      if (cap != null) {
        setVisibleCount(Math.min(cap, items.length));
        return;
      }
      const pills = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-measure-pill]"),
      );
      const widths = pills.map((el) => el.getBoundingClientRect().width);
      setVisibleCount(
        fitVisibleCount(widths, container.getBoundingClientRect().width),
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [items, cap]);

  const selected = items.find((item) => item.id === value);
  const visible =
    cap === 1 && selected
      ? [selected]
      : items.slice(0, visibleCount);
  const overflow =
    cap === 1 && selected
      ? items.filter((item) => item.id !== value)
      : items.slice(visibleCount);

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute flex gap-2 whitespace-nowrap"
      >
        {items.map((item) => (
          <span
            key={item.id}
            data-measure-pill=""
            className={pillClassName}
          >
            {tabLabel(item)}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 items-center justify-center gap-2">
        {visible.map((item) => (
          <Pill
            key={item.id}
            item={item}
            selected={value === item.id}
            onClick={() => onChange(item.id)}
          />
        ))}
        <MoreTabsButton items={overflow} value={value} onChange={onChange} />
      </div>
    </div>
  );
}
