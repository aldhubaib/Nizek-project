"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  COMBOBOX_COLLISION_AVOIDANCE,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  countryFlag,
  countryName,
  parseCountryCodes,
  sortedCountries,
  stringifyCountryCodes,
} from "@/lib/countries";

export function CountryField({
  value,
  onChange,
  multiple = true,
}: {
  value: string;
  onChange: (next: string) => void;
  multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => sortedCountries(), []);
  const codes = parseCountryCodes(value);
  const selectedCodes = multiple ? codes : codes.slice(0, 1);
  const selected = new Set(selectedCodes);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (country) =>
        country.name.toLowerCase().includes(q) ||
        country.code.toLowerCase().includes(q),
    );
  }, [all, query]);

  function commitCodes(next: string[]) {
    onChange(stringifyCountryCodes(multiple ? next : next.slice(0, 1)));
  }

  function pick(code: string) {
    if (!code) {
      commitCodes([]);
      setOpen(false);
      setQuery("");
      return;
    }
    if (multiple) {
      commitCodes(
        selected.has(code)
          ? selectedCodes.filter((item) => item !== code)
          : [...selectedCodes, code],
      );
      return;
    }
    commitCodes([code]);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        type="button"
        className="flex min-h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2 py-1.5 text-start dark:bg-input/30"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selectedCodes.length === 0 ? (
            <span className="text-s text-muted-foreground">
              {multiple ? "Select countries…" : "Select a country…"}
            </span>
          ) : multiple ? (
            selectedCodes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
              >
                <span className="text-sm leading-none">{countryFlag(code)}</span>
                {countryName(code)}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    commitCodes(selectedCodes.filter((item) => item !== code));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    commitCodes(selectedCodes.filter((item) => item !== code));
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${countryName(code)}`}
                >
                  <X className="size-2.5" />
                </span>
              </span>
            ))
          ) : (
            <span className="flex min-w-0 items-center gap-1.5 text-s">
              <span className="text-sm leading-none">
                {countryFlag(selectedCodes[0] ?? "")}
              </span>
              <span className="truncate">{countryName(selectedCodes[0] ?? "")}</span>
            </span>
          )}
        </div>
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
            placeholder="Search countries"
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
              {!multiple && !query.trim() && (
                <li>
                  <button
                    type="button"
                    onClick={() => pick("")}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-s text-muted-foreground hover:bg-accent/60",
                      selectedCodes.length === 0 && "bg-accent/40",
                    )}
                  >
                    <span className="min-w-0 flex-1">—</span>
                    {selectedCodes.length === 0 && (
                      <Check className="size-3.5 shrink-0" />
                    )}
                  </button>
                </li>
              )}
              {filtered.map((country) => {
                const on = selected.has(country.code);
                return (
                  <li key={country.code}>
                    <button
                      type="button"
                      onClick={() => pick(country.code)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent/60",
                        on && "bg-accent/40",
                      )}
                    >
                      <span className="w-6 text-base leading-none">
                        {countryFlag(country.code)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-s">
                        {country.name}
                      </span>
                      {on && <Check className="size-3.5 shrink-0 text-foreground" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
