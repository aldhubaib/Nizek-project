"use client";

import { format } from "date-fns";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

function calendarDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sprintLengthDays(startDate: string, endDate: string): number {
  const start = calendarDate(startDate).getTime();
  const end = calendarDate(endDate).getTime();
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

export function StartSprintDialog({
  open,
  sprintName,
  startDate,
  endDate,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  sprintName: string;
  startDate: string;
  endDate: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const startLabel = format(calendarDate(startDate), "d MMM yyyy");
  const endLabel = format(calendarDate(endDate), "d MMM yyyy");
  const days = sprintLengthDays(startDate, endDate);
  const dayWord = days === 1 ? "day" : "days";

  return (
    <>
      <div
        className="fixed inset-0 z-[900] bg-overlay backdrop-blur-sm"
        onClick={() => !pending && onOpenChange(false)}
      />
      <div className="fixed top-1/2 left-1/2 z-[901] w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-2xl">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <Play className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Start sprint
                </div>
                <p className="text-s leading-relaxed text-muted-foreground">
                  By starting{" "}
                  <span className="font-medium text-foreground">{sprintName}</span> you are
                  committed to delivering the planned tasks between{" "}
                  <span className="font-medium text-foreground">{startLabel}</span> and{" "}
                  <span className="font-medium text-foreground">{endLabel}</span>{" "}
                  ({days} {dayWord}).
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={pending}>
              {pending && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
              Start sprint
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
