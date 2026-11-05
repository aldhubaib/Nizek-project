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
import type { RecordDTO } from "@/lib/modules/types";

export type RecordCardDisplay = {
  fields: CustomFieldDTO[];
  visibleFieldIds: string[];
  ctx: FieldDisplayContext;
};

interface Props {
  record: RecordDTO;
  onOpen?: (record: RecordDTO) => void;
  draggable?: boolean;
  isOverlay?: boolean;
  display?: RecordCardDisplay;
}

export const RecordCard = memo(function RecordCard({
  record,
  onOpen,
  draggable = true,
  isOverlay = false,
  display,
}: Props) {
  const drag = useDraggable({
    id: record.id,
    data: { type: "record", stageId: record.stageId },
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
        .map((field) => formatFieldValue(field, record, display.ctx))
        .find((value) => value.trim())) ||
    record.title;

  return (
    <div
      ref={isOverlay ? undefined : drag.setNodeRef}
      {...(isOverlay ? {} : drag.attributes)}
      {...(isOverlay ? {} : drag.listeners)}
      onClick={() => onOpen?.(record)}
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
          {formatRecordNumber(record.recordNumber)}
        </span>
      )}
      <p className="truncate text-s font-semibold">{heading}</p>
      {extras.map((field) => {
        if (!display) return null;
        const value = formatFieldValue(field, record, display.ctx);
        if (!value) return null;
        if (
          !fieldIsLogicallyVisible(
            field,
            record.fieldValues ?? {},
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
      {record.assignee && (
        <div className="mt-2 flex items-center gap-1.5">
          <MemberAvatar person={record.assignee} size="xs" />
          <span className="truncate text-xs text-muted-foreground">
            {record.assignee.name ?? "Assigned"}
          </span>
        </div>
      )}
    </div>
  );
});
