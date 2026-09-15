"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PriorityIcon } from "@/components/task/priority-icon";
import type { TaskPriorityId } from "@/lib/task-label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FIELD_PRIORITIES,
  FIELD_PRIORITY_LABEL,
  isFieldPriority,
} from "@/lib/fields/priority";
import { cn } from "@/lib/utils";

export function PriorityField({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = isFieldPriority(value) ? value : "";

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-start text-s dark:bg-input/30"
      >
        {current ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <PriorityIcon
              priority={current as TaskPriorityId}
              className="size-3.5"
            />
            <span className="truncate">{FIELD_PRIORITY_LABEL[current]}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            —
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-52 p-1">
        <ul>
          {!required && (
            <li>
              <button
                type="button"
                onClick={() => pick("")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-s text-muted-foreground hover:bg-accent/60",
                  !current && "bg-accent/40",
                )}
              >
                <span className="min-w-0 flex-1">—</span>
                {!current && <Check className="size-3.5 shrink-0" />}
              </button>
            </li>
          )}
          {FIELD_PRIORITIES.map((id) => {
            const on = current === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => pick(id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent/60",
                    on && "bg-accent/40",
                  )}
                >
                  <PriorityIcon
                    priority={id as TaskPriorityId}
                    className="size-3.5"
                  />
                  <span className="min-w-0 flex-1 text-s">
                    {FIELD_PRIORITY_LABEL[id]}
                  </span>
                  {on && <Check className="size-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
