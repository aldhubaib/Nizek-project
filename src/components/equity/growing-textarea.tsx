"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A textarea the height of what's written in it. A paragraph you can only see
 * a few lines of at a time is one you can't check over before saving, so every
 * long-text box on the portfolio grows with its content — as it's typed, and
 * when it arrives already written — and never scrolls inside itself.
 */
export function GrowingTextarea({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Reset first: scrollHeight is measured against the current height, so
  // without it the box could only ever get taller.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      disabled={disabled}
      className={cn(className, "h-auto min-h-9 resize-none overflow-hidden")}
    />
  );
}
