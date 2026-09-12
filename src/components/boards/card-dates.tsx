"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  dueState,
  formatDue,
  fromDateInput,
  toDateInput,
  type DueState,
} from "@/lib/board-dates";

interface Props {
  startDate: Date | null;
  dueDate: Date | null;
  dueDone: boolean;
  canEdit: boolean;
  onSave: (patch: {
    startDate?: Date | null;
    dueDate?: Date | null;
    dueDone?: boolean;
  }) => void;
}

const DUE_TONE: Record<DueState, string> = {
  done: "border-success/40 bg-success/10 text-success",
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  soon: "border-orange/40 bg-orange/10 text-orange",
  later: "border-border bg-field text-foreground/80",
};

const FIELD =
  "h-8 rounded-md border border-border bg-field px-2 text-s outline-none focus:border-primary/50 disabled:opacity-60";

export function CardDates({ startDate, dueDate, dueDone, canEdit, onSave }: Props) {
  // The form is local until Save, unlike the rest of the card, which writes on
  // blur. The two days only mean something together, so saving one the moment
  // it is picked would reject a pair that is fine once both are in.
  const [startDay, setStartDay] = useState(toDateInput(startDate));
  const [dueDay, setDueDay] = useState(toDateInput(dueDate));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const state = dueState({ dueDate, dueDone });

  function save() {
    const start = fromDateInput(startDay);
    const due = fromDateInput(dueDay);
    if (start && due && start > due) {
      setError("The start is after the due date.");
      return;
    }
    setError(null);
    onSave({ startDate: start, dueDate: due });
    setOpen(false);
  }

  function clear() {
    setStartDay("");
    setDueDay("");
    setError(null);
    onSave({ startDate: null, dueDate: null });
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Ticking a due date off is one click, outside the popover: it is the
          thing you do most often to a date and the least worth a form. */}
      {dueDate && (
        <label
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-s",
            DUE_TONE[state ?? "later"],
            canEdit && "cursor-pointer",
          )}
        >
          <input
            type="checkbox"
            checked={dueDone}
            disabled={!canEdit}
            onChange={(event) => onSave({ dueDone: event.target.checked })}
            className="size-3.5 accent-current"
            aria-label="Mark the due date as done"
          />
          <CalendarClock className="size-3.5" />
          {formatDue(dueDate)}
          {state === "overdue" && <span className="text-xs font-medium">Overdue</span>}
        </label>
      )}

      <Popover
        open={open}
        onOpenChange={(next) => {
          // Reopening starts from what is saved, not from an abandoned edit.
          if (next) {
            setStartDay(toDateInput(startDate));
            setDueDay(toDateInput(dueDate));
            setError(null);
          }
          setOpen(next);
        }}
      >
        <PopoverTrigger
          disabled={!canEdit}
          className="flex items-center gap-1.5 rounded-md border border-border bg-field px-2 py-1 text-s text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          <CalendarClock className="size-3.5" />
          {dueDate || startDate ? "Edit dates" : "Dates"}
          <ChevronDown className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <div className="space-y-3">
            <p className="text-s font-medium">Dates</p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Start date
              </label>
              <input
                type="date"
                value={startDay}
                onChange={(event) => setStartDay(event.target.value)}
                className={cn(FIELD, "w-full")}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Due date
              </label>
              <input
                type="date"
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value)}
                className={cn(FIELD, "w-full")}
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                className="flex-1 rounded-md bg-primary px-3 py-1.5 text-s font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Save
              </button>
              {(startDate || dueDate) && (
                <button
                  type="button"
                  onClick={clear}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-s text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                  Remove
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {startDate && (
        <span className="text-xs text-muted-foreground">
          Starts {formatDue(startDate)}
        </span>
      )}
    </div>
  );
}
