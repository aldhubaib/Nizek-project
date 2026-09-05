"use client";

import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shipping is the client accepting a sprint, but only staff can move a sprint
 * into Shipped — so whoever does it is recording someone else's approval. This
 * asks them to own that before the move goes through.
 */
export function ConfirmShipSprintDialog({
  open,
  sprintName,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  sprintName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[900] bg-overlay backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed top-1/2 left-1/2 z-[901] w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="overflow-hidden rounded-xl border border-orange/30 bg-card shadow-2xl">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange/15 text-orange">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Approving for the client
                </div>
                <p className="text-s leading-relaxed text-muted-foreground">
                  Moving{" "}
                  <span className="font-medium text-foreground">{sprintName}</span> to
                  Shipped records this sprint as accepted by the client. You are approving
                  it on their behalf, and you will be held responsible for that decision.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm}>
              I acknowledge
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
