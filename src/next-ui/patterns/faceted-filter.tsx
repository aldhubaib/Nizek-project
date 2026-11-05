"use client"

import * as React from "react"
import { Check, PlusCircle } from "lucide-react"

import { cn } from "@/next-ui/lib/cn"

import { Badge } from "@/next-ui/ui/badge"
import { Button } from "@/next-ui/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/next-ui/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/next-ui/ui/popover"
import { Separator } from "@/next-ui/ui/separator"

export interface FacetOption {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

/**
 * The dashed "+ Label" multi-select chip of a filter bar (docs/blocks-brief.md, decision 6).
 * It knows nothing about tables: options, counts and the selection come in, the selection goes
 * out. `useList` supplies all of it.
 */
export function FacetedFilter({
  label,
  options,
  counts,
  selected,
  onChange,
}: {
  label: string
  options: FacetOption[]
  counts?: Map<string, number>
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const chosen = new Set(selected)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed" data-testid={`facet-${label}`}>
          <PlusCircle />
          {label}
          {chosen.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <div className="flex gap-1">
                {chosen.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {chosen.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((o) => chosen.has(o.value))
                    .map((o) => (
                      <Badge key={o.value} variant="secondary" className="rounded-sm px-1 font-normal">
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={label} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const isSelected = chosen.has(o.value)
                const n = counts?.get(o.value)
                return (
                  <CommandItem
                    key={o.value}
                    onSelect={() => {
                      const next = new Set(chosen)
                      if (isSelected) next.delete(o.value)
                      else next.add(o.value)
                      onChange([...next])
                    }}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input [&_svg]:invisible",
                      )}
                    >
                      <Check className="size-3.5" />
                    </div>
                    {o.icon && <o.icon className="size-4 text-muted-foreground" />}
                    <span>{o.label}</span>
                    {n != null && <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{n}</span>}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {chosen.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
