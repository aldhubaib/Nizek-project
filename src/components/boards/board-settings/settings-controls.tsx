"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_COLORS, BOARD_ICONS } from "@/lib/board-palette";
import { BoardIcon } from "../board-icon";

/**
 * The small controls the settings screens share.
 *
 * Colour and icon are picked from fixed lists rather than typed.
 * `src/lib/board-palette.ts` explains the colour half: Tailwind only emits
 * classes it can find written out, so a free-form value would render as
 * nothing. The icon half is the same bargain — the stored name is looked up in
 * a component map, and a name outside the list resolves to undefined.
 */

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BOARD_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          onClick={() => onChange(color.id)}
          title={color.label}
          aria-label={color.label}
          aria-pressed={value === color.id}
          className={cn(
            "grid size-6 place-items-center rounded-full border-2 transition-colors",
            value === color.id ? "border-foreground/60" : "border-transparent",
          )}
        >
          <span className={cn("size-4 rounded-full", color.dot)} />
        </button>
      ))}
    </div>
  );
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BOARD_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          title={icon}
          aria-label={icon}
          aria-pressed={value === icon}
          className={cn(
            "grid size-7 place-items-center rounded-md border transition-colors",
            value === icon
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <BoardIcon name={icon} className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/**
 * A name that saves when you leave it, not as you type it.
 *
 * Held locally while it is being edited so a rename is one write rather than
 * one per keystroke, and reverts to the stored value if it is left blank.
 */
export function InlineName({
  value,
  onSave,
  className,
  placeholder,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(value);
      return;
    }
    if (trimmed === value) return;
    onSave(trimmed);
  }

  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={cn("min-w-0 bg-transparent text-s outline-none", className)}
    />
  );
}

/** A labelled on/off row, used across the role editor and the field builder. */
export function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-start transition-colors",
        disabled ? "opacity-50" : "hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors",
          checked ? "border-primary bg-primary" : "border-muted-foreground/40",
        )}
      >
        {checked && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-s text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}
