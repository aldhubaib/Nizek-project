"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmCompleteSprintDialog({
  open,
  sprintName,
  pending,
  hasIncomplete,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  sprintName: string;
  pending?: boolean;
  hasIncomplete?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const Icon = hasIncomplete ? AlertTriangle : CheckCircle2;

  return (
    <>
      <div
        className="fixed inset-0 z-[900] bg-overlay backdrop-blur-sm"
        onClick={() => !pending && onOpenChange(false)}
      />
      <div className="fixed top-1/2 left-1/2 z-[901] w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div
          className={cn(
            "overflow-hidden rounded-xl bg-card shadow-2xl",
            hasIncomplete ? "border border-destructive/30" : "border border-success/30",
          )}
        >
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
              <div
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                  hasIncomplete ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  End sprint
                </div>
                <p className="text-s leading-relaxed text-muted-foreground">
                  {hasIncomplete ? (
                    <>
                      Unfinished items in{" "}
                      <span className="font-medium text-foreground">{sprintName}</span> will
                      return to the backlog with the reasons recorded in this review. This
                      sprint will be marked as partially completed.
                    </>
                  ) : (
                    <>
                      All tasks in{" "}
                      <span className="font-medium text-foreground">{sprintName}</span> are
                      Done. The sprint will be marked as completed.
                    </>
                  )}
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
            <Button
              size="sm"
              variant={hasIncomplete ? "destructive" : "default"}
              onClick={onConfirm}
              disabled={pending}
            >
              {pending && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
              End sprint
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
