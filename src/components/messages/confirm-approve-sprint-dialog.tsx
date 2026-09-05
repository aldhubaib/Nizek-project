"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The client signing off a sprint.
 *
 * Approving is what releases the work, so it should not be one tap away from a
 * card in a chat thread. This spells out what the tap means — that they have
 * tested it and are happy for it to go out — before it goes through.
 *
 * It renders through a portal because it is raised from deep inside the message
 * list, which scrolls and clips its own children.
 */
export function ConfirmApproveSprintDialog({
  open,
  sprintName,
  saving,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  sprintName: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, saving, onOpenChange]);

  // Only ever opened by a click, so there is no server render to hydrate.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-sm"
        style={{ zIndex: 900 }}
        onClick={() => !saving && onOpenChange(false)}
      />
      <div
        className="fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4"
        style={{ zIndex: 901 }}
      >
        <div className="overflow-hidden rounded-xl border border-success/30 bg-card shadow-2xl">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                <CircleCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Approve this sprint
                </div>
                <p className="text-s leading-relaxed text-muted-foreground">
                  By approving{" "}
                  <span className="font-medium text-foreground">{sprintName}</span> you
                  are confirming you have tested the work in it and that it is ready to
                  deploy.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={onConfirm}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Approving
                </>
              ) : (
                "Yes, approve it"
              )}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
