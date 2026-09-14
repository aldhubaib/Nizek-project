"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
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
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const all = useMemo(() => sortedCountries(), []);
  const codes = parseCountryCodes(value);
  const selected = new Set(codes);
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
    onChange(stringifyCountryCodes(next));
  }

  function toggle(code: string) {
    commitCodes(
      selected.has(code)
        ? codes.filter((item) => item !== code)
        : [...codes, code],
    );
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
          {codes.length === 0 ? (
            <span className="text-s text-muted-foreground">Select countries…</span>
          ) : (
            codes.map((code) => (
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
                    commitCodes(codes.filter((item) => item !== code));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    commitCodes(codes.filter((item) => item !== code));
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${countryName(code)}`}
                >
                  <X className="size-2.5" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (filtered[0]) toggle(filtered[0].code);
            }}
            placeholder="Search countries"
            className="h-8 ps-8 text-s"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-s text-muted-foreground">
              No matches for “{query.trim()}”
            </p>
          ) : (
            <ul>
              {filtered.map((country) => {
                const on = selected.has(country.code);
                return (
                  <li key={country.code}>
                    <button
                      type="button"
                      onClick={() => toggle(country.code)}
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
