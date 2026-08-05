"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A delete that has to be typed back before it will go through.
 *
 * The browser's confirm() takes one reflex click, which is the wrong weight for
 * a record nobody re-enters from memory — a reported quarter is figures someone
 * had to go and ask for. Typing the project's name is deliberately slower, and
 * the same gesture the portfolio itself asks for, so the two read as one rule.
 *
 * The word typed here is sent on to the action rather than being trusted as a
 * boolean, so the server refuses the delete on its own terms too.
 *
 * Mount it only while a record is pending, keyed by that record: the box starts
 * empty because the component is new, so a name typed for one record can never
 * be left sitting there ready to confirm the next.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  /** What has to be typed back — the project's name, for anything in equity. */
  confirmWord: string;
  confirmLabel?: string;
  onConfirm: (typed: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const matches = typed.trim() === confirmWord;

  async function run() {
    if (!matches || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(typed);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || "Failed to delete");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">
            Type <strong className="text-foreground">{confirmWord}</strong> to
            confirm:
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={run} disabled={!matches || busy}>
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
