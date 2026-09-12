"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/dial-codes";
import type { ContactDTO } from "@/actions/contact";

interface Props {
  contact: ContactDTO;
  onOpen?: (contact: ContactDTO) => void;
  onDelete?: (contact: ContactDTO) => void;
  /** Off for the drag overlay copy, which must not register a second time. */
  draggable?: boolean;
  isOverlay?: boolean;
  busy?: boolean;
}

/**
 * `useDraggable`, not `useSortable`: cards are sorted by name inside a column,
 * so there is no slot to shuffle into and nothing for a sortable transform to
 * animate. Dragging one only ever answers "which column", and the overlay is
 * what the person actually sees move.
 */
export const ContactCard = memo(function ContactCard({
  contact,
  onOpen,
  onDelete,
  draggable = true,
  isOverlay = false,
  busy = false,
}: Props) {
  const drag = useDraggable({
    id: contact.id,
    data: { type: "contact", stageId: contact.stageId },
    disabled: !draggable || isOverlay,
  });

  const initials =
    `${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`.toUpperCase();

  return (
    <div
      ref={isOverlay ? undefined : drag.setNodeRef}
      {...(isOverlay ? {} : drag.attributes)}
      {...(isOverlay ? {} : drag.listeners)}
      onClick={() => onOpen?.(contact)}
      className={cn(
        "group rounded-md border border-border bg-field px-3 py-2.5 text-start",
        draggable && !isOverlay && "cursor-grab active:cursor-grabbing",
        onOpen && "hover:border-foreground/40",
        drag.isDragging && !isOverlay && "opacity-40",
        isOverlay && "shadow-2xl",
        busy && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15">
          <span className="text-[10px] font-bold text-primary">{initials}</span>
        </div>
        <p className="min-w-0 flex-1 truncate text-s font-semibold">
          {contact.firstName} {contact.lastName}
        </p>
        {onDelete && !isOverlay && (
          <button
            type="button"
            title="Delete contact"
            aria-label={`Delete ${contact.firstName} ${contact.lastName}`}
            onClick={(event) => {
              // The whole card is a drag handle and opens the editor, so the
              // click must not travel any further than this button.
              event.stopPropagation();
              onDelete(contact);
            }}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {(contact.role || contact.companyName) && (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {[contact.role, contact.companyName].filter(Boolean).join(" · ")}
        </p>
      )}

      <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground/80">
        {formatPhone(contact.phoneCountry, contact.phoneNumber)}
      </p>
    </div>
  );
});
