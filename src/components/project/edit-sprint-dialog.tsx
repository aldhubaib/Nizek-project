"use client";

import { useEffect, useState, useTransition } from "react";
import { updateSprint, type SprintDTO } from "@/actions/sprint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-s dark:bg-input/30";

interface Props {
  sprint: SprintDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (sprint: SprintDTO) => void;
}

export function EditSprintDialog({ sprint, open, onOpenChange, onSaved }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open || !sprint) return;
    setName(sprint.name);
    setError(null);
  }, [open, sprint]);

  function handleSave() {
    if (!sprint || !name.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const saved = await updateSprint({
          sprintId: sprint.id,
          name,
        });
        onSaved(saved);
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update sprint");
      }
    });
  }

  return (
    <Dialog open={open && sprint != null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader className="gap-1.5 pr-8">
          <DialogTitle className="text-lg font-semibold">
            Edit sprint: {sprint?.name}
          </DialogTitle>
          <DialogDescription>
            Dates and duration live on the Sprint Planning document. Required fields
            are marked with an asterisk <span className="text-destructive">*</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sprint-name">
              Sprint name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sprint-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              autoFocus
            />
          </div>

          {error ? <p className="text-s text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || !name.trim()}
          >
            {pending ? "Updating…" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
