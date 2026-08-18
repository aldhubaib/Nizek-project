"use client";

import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type AddButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  /** Spoken name — the plus has no visible text. */
  label: string;
  busy?: boolean;
};

/**
 * The one Add control in the app: a primary circle with a plus.
 * Pass `label` for the tooltip and screen reader (e.g. "Add Portfolio").
 */
export function AddButton({
  label,
  busy = false,
  className,
  type = "button",
  disabled,
  title,
  ...props
}: AddButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={title ?? label}
      disabled={disabled || busy}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}
