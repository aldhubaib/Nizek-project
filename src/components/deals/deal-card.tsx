"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  formatFieldValue,
  type FieldDisplayContext,
} from "@/lib/fields/display";
import type { CustomFieldDTO } from "@/actions/custom-field";
import type { DealDTO } from "@/actions/deal";

export type DealCardDisplay = {
  fields: CustomFieldDTO[];
  visibleFieldIds: string[];
  ctx: FieldDisplayContext;
};

interface Props {
  deal: DealDTO;
  onOpen?: (deal: DealDTO) => void;
  draggable?: boolean;
  isOverlay?: boolean;
  display?: DealCardDisplay;
}

export const DealCard = memo(function DealCard({
  deal,
  onOpen,
  draggable = true,
  isOverlay = false,
  display,
}: Props) {
  const drag = useDraggable({
    id: deal.id,
    data: { type: "deal", stageId: deal.stageId },
    disabled: !draggable || isOverlay,
  });

  const extras =
    display?.fields.filter(
      (field) =>
        field.binding !== "title" && display.visibleFieldIds.includes(field.id),
    ) ?? [];

  return (
    <div
      ref={isOverlay ? undefined : drag.setNodeRef}
      {...(isOverlay ? {} : drag.attributes)}
      {...(isOverlay ? {} : drag.listeners)}
      onClick={() => onOpen?.(deal)}
      className={cn(
        "group rounded-md border border-border bg-field px-3 py-2.5 text-start",
        draggable && !isOverlay && "cursor-grab active:cursor-grabbing",
        onOpen && "hover:border-foreground/40",
        drag.isDragging && !isOverlay && "opacity-40",
        isOverlay && "shadow-2xl",
      )}
    >
      <p className="truncate text-s font-semibold">{deal.title}</p>
      {extras.map((field) => {
        const value = display
          ? formatFieldValue(field, deal, display.ctx)
          : "";
        if (!value) return null;
        return (
          <p
            key={field.id}
            className="mt-1 truncate text-xs text-muted-foreground"
            dir={field.script === "arabic" ? "rtl" : undefined}
          >
            <span className="text-muted-foreground/70">{field.label}</span>
            {" · "}
            {value}
          </p>
        );
      })}
    </div>
  );
});
