"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/next-ui/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/next-ui/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

/**
 * The search of a page, as it appears in a pane header: an icon until the user clicks it, then
 * a field that searches that pane. It stays open while it holds text; Escape clears and closes.
 * Always first among the header actions.
 */
export function PaneHeaderSearch({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  /** Enter in the box (a deliberate search, as against the instant match while typing). */
  onSubmit?: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const shown = open || value !== "";

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!shown) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            data-pane-header-search=""
            className="order-first text-muted-foreground"
            onClick={() => setOpen(true)}
          >
            <Search />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  const close = () => {
    onChange("");
    setOpen(false);
  };
  return (
    <InputGroup data-pane-header-search="" className="order-first w-56">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => value === "" && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          else if (e.key === "Enter" && onSubmit && value.trim()) {
            e.preventDefault();
            onSubmit(value.trim());
          }
        }}
        placeholder={placeholder}
        aria-label={label}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Clear search" onClick={close}>
          <X />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
