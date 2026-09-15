"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  COMBOBOX_COLLISION_AVOIDANCE,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DEFAULT_DIAL_COUNTRY,
  dialCode,
  dialOptions,
  parsePhoneValue,
  stringifyPhoneValue,
} from "@/lib/dial-codes";

export function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const parsed = parsePhoneValue(value);
  const country = parsed.country || DEFAULT_DIAL_COUNTRY;
  const options = useMemo(() => dialOptions(), []);
  const selected = options.find((option) => option.code === country) ?? options[0];
  const prefix = dialCode(country);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(q) ||
        option.code.toLowerCase().includes(q) ||
        option.dial.replace(/^\+/, "").includes(q),
    );
  }, [options, query]);

  function commit(next: { country: string; number: string }) {
    onChange(stringifyPhoneValue(next));
  }

  function pick(code: string) {
    commit({ country: code, number: parsed.number });
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="flex gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          type="button"
          aria-label="Country"
          className="flex h-9 min-w-[8.5rem] items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-base leading-none">{selected?.flag}</span>
            <span className="truncate">{selected?.name}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionAvoidance={COMBOBOX_COLLISION_AVOIDANCE}
          className="flex w-80 max-h-[min(20rem,var(--available-height))] flex-col overflow-hidden p-2"
          initialFocus={() => {
            searchRef.current?.focus({ preventScroll: true });
            return false;
          }}
        >
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (filtered[0]) pick(filtered[0].code);
              }}
              placeholder="Search country or code"
              className="h-8 ps-8 text-s"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-s text-muted-foreground">
                No matches for “{query.trim()}”
              </p>
            ) : (
              <ul>
                {filtered.map((option) => {
                  const on = option.code === country;
                  return (
                    <li key={option.code}>
                      <button
                        type="button"
                        onClick={() => pick(option.code)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent/60",
                          on && "bg-accent/40",
                        )}
                      >
                        <span className="w-6 text-base leading-none">
                          {option.flag}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-s">
                          {option.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {option.dial}
                        </span>
                        {on && <Check className="size-3.5 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <div className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        <span className="shrink-0 ps-2.5 font-mono text-s tabular-nums text-muted-foreground">
          {prefix}
        </span>
        <input
          type="tel"
          inputMode="tel"
          value={parsed.number}
          onChange={(e) => commit({ country, number: e.target.value })}
          placeholder="50123456"
          aria-label="Phone number"
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-s outline-none"
        />
      </div>
    </div>
  );
}
