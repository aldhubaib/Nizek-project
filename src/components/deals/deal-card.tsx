"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { formatRecordNumber } from "@/lib/modules/record-number";
import {
  formatFieldValue,
  type FieldDisplayContext,
} from "@/lib/fields/display";
import { fieldIsLogicallyVisible } from "@/lib/fields/visibility";
import { MemberAvatar } from "@/components/boards/member-avatar";
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
      <span className="font-mono text-xs text-muted-foreground/60">
        {formatRecordNumber(deal.recordNumber)}
      </span>
      <p className="truncate text-s font-semibold">{deal.title}</p>
      {extras.map((field) => {
        if (!display) return null;
        const value = formatFieldValue(field, deal, display.ctx);
        if (!value) return null;
        if (
          !fieldIsLogicallyVisible(
            field,
            deal.fieldValues ?? {},
            display.fields.map((row) => row.id),
          )
        ) {
          return null;
        }
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
      {deal.assignee && (
        <div className="mt-2 flex items-center gap-1.5">
          <MemberAvatar person={deal.assignee} size="xs" />
          <span className="truncate text-xs text-muted-foreground">
            {deal.assignee.name ?? "Assigned"}
          </span>
        </div>
      )}
    </div>
  );
});
