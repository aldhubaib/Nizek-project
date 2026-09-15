"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { formatRecordNumber } from "@/lib/modules/record-number";
import { CARD_RECORD_NUMBER_KEY } from "@/lib/modules/card-fields";
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
    display?.fields.filter((field) => {
      if (field.binding === "title") return false;
      if (!display.visibleFieldIds.includes(field.id)) return false;
      if (field.type === "formula" && field.formula?.cardTitle) return false;
      return true;
    }) ?? [];
  const heading =
    (display &&
      display.fields
        .filter(
          (field) =>
            field.type === "formula" &&
            field.formula?.cardTitle &&
            display.visibleFieldIds.includes(field.id),
        )
        .map((field) => formatFieldValue(field, deal, display.ctx))
        .find((value) => value.trim())) ||
    deal.title;

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
      {(!display || display.visibleFieldIds.includes(CARD_RECORD_NUMBER_KEY)) && (
        <span className="font-mono text-xs text-muted-foreground/60">
          {formatRecordNumber(deal.recordNumber)}
        </span>
      )}
      <p className="truncate text-s font-semibold">{heading}</p>
      {extras.map((field) => {
        if (!display) return null;
        const value = formatFieldValue(field, deal, display.ctx);
        if (!value) return null;
        if (
          !fieldIsLogicallyVisible(
            field,
            deal.fieldValues ?? {},
            display.fields.map((row) => row.id),
            display.fields,
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
