"use client";

import type { LucideIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function LinkedCountPopover({
  count,
  completed,
  singular,
  plural,
  icon: Icon,
  children,
  open,
  onOpenChange,
  className,
}: {
  count: number;
  completed?: number;
  singular: string;
  plural: string;
  icon: LucideIcon;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  if (count <= 0) return null;
  const noun = count === 1 ? singular : plural;
  const label =
    completed != null ? `${completed}/${count} ${noun}` : `${count} ${noun}`;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors",
          className,
        )}
      >
        <Icon className="h-3 w-3" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 gap-1 p-2">
        <div className="px-1.5 py-1 text-s font-semibold">{label}</div>
        <div className="max-h-72 space-y-1 overflow-y-auto">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
