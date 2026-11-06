"use client";

import * as React from "react";

import { cn } from "@/next-ui/lib/cn";

import { HeaderAction } from "./header-action";

/**
 * A header action that is also a gauge. A ring around the icon fills as the required data comes
 * in — amber while something is still missing, solid green once nothing is — and the button acts
 * only when the ring is full. Pressed early, it goes to what is missing instead, so it never
 * looks dead and the way forward is always one click away. A reason that is not about missing
 * data (another sprint still running, dates the wrong way round) shows a full grey ring and the
 * reason as the button's name.
 */
export function RingAction({
  label,
  icon,
  missing,
  total,
  reason,
  onAct,
  onBlocked,
  pending = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof HeaderAction>, "label" | "icon" | "onClick" | "variant" | "disabled" | "title"> & {
  /** What it does when full, in two or three words ("Start sprint"); the tooltip and the accessible name. */
  label: string;
  /** The icon inside the ring, given `className="size-3"` (and `fill-current` to make it solid). */
  icon: React.ReactNode;
  /** Required fields still empty, and how many there are in all. */
  missing: number;
  total: number;
  /** Why it cannot act although nothing is missing; null when the count alone decides. */
  reason?: string | null;
  onAct: () => void;
  /** Pressed while something is missing: usually scrolls to the list of what is. */
  onBlocked?: () => void;
  /** The action is under way: the button waits. */
  pending?: boolean;
}) {
  const ready = missing <= 0 && !reason;
  const ratio = total > 0 ? Math.min(1, Math.max(0, (total - missing) / total)) : 1;
  const name = reason && missing <= 0 ? reason : missing > 0 ? `${label} · ${missing} missing` : label;
  const tone = ready ? "text-success" : missing > 0 ? "text-warning" : "text-muted-foreground/60";
  // the ring: a 24-unit box, radius 10, so a full turn is 2π·10
  const turn = 2 * Math.PI * 10;
  return (
    <HeaderAction
      label={name}
      variant="ghost"
      className={cn("rounded-full", className)}
      aria-disabled={ready ? undefined : true}
      disabled={pending}
      onClick={() => (ready ? onAct() : onBlocked?.())}
      data-ready={ready ? "true" : "false"}
      data-missing={missing}
      data-total={total}
      icon={
        <span className={cn("relative grid size-6 shrink-0 place-items-center transition-colors duration-500", ready ? "text-success" : "text-muted-foreground")}>
          <svg viewBox="0 0 24 24" className="absolute inset-0 size-6 -rotate-90" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-foreground/15" />
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={turn}
              strokeDashoffset={turn * (1 - ratio)}
              className={cn("transition-[stroke-dashoffset,color] duration-500 ease-out", tone)}
            />
          </svg>
          <span className="relative grid place-items-center">{icon}</span>
        </span>
      }
      {...props}
    />
  );
}
