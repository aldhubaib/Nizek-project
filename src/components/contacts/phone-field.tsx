"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dialCode, dialOptions } from "@/lib/dial-codes";
import { countryFlag, countryName } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A dialling-code picker joined to a number box, stored as two values.
 *
 * The picker is a searchable popover rather than a `<select>` because there are
 * ~250 countries: a native dropdown that long is a scroll, and the trigger has
 * to stay narrow enough to sit beside the number. Typing filters on country
 * name and on the code itself, so "965" and "kuw" both land on Kuwait.
 */
export function PhoneField({
  country,
  number,
  onCountryChange,
  onNumberChange,
  autoFocus = false,
}: {
  country: string;
  number: string;
  onCountryChange: (code: string) => void;
  onNumberChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const numberRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => dialOptions(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase() === q ||
        o.dial.slice(1).startsWith(q),
    );
  }, [options, query]);

  function pick(code: string) {
    onCountryChange(code);
    setOpen(false);
    setQuery("");
    // Picking a code is never the last step, so hand the caret on.
    numberRef.current?.focus();
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-input bg-transparent px-2 text-sm transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Dialling code: ${countryName(country)} ${dialCode(country)}`}
        >
          <span aria-hidden>{countryFlag(country)}</span>
          <span className="font-mono tabular-nums">{dialCode(country)}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 gap-2 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code"
              className="h-8 ps-8 text-s"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-s text-muted-foreground">
                No country matches “{query.trim()}”
              </p>
            ) : (
              <ul>
                {filtered.map((o) => {
                  const selected = o.code === country;
                  return (
                    <li key={o.code}>
                      <button
                        type="button"
                        onClick={() => pick(o.code)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-s transition-colors hover:bg-accent/60",
                          selected && "bg-accent/40",
                        )}
                      >
                        <span aria-hidden>{o.flag}</span>
                        <span className="min-w-0 flex-1 truncate">{o.name}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {o.dial}
                        </span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Input
        ref={numberRef}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={number}
        onChange={(e) => onNumberChange(e.target.value)}
        placeholder="50123456"
        autoFocus={autoFocus}
      />
    </div>
  );
}
