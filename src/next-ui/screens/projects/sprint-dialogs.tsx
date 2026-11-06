"use client";

import * as React from "react";

import { SPRINT_DATE_RANGE_ERROR } from "@/lib/sprint-planning-doc";
import { useDeleteSprint, useSetSprintColumn, useUpdateSprint, type SprintDTO } from "@/next-ui/data/sprints";
import { ConfirmDialog, ErrorNote, errorText } from "@/next-ui/patterns/form-bits";
import { Button } from "@/next-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Textarea } from "@/next-ui/ui/textarea";

/**
 * The small things done to a sprint from its card's ⋯: its name, goal and dates, shipping a
 * finished sprint, and deleting one by typing its name. Planning and reviewing a sprint happen
 * on its document page (`sprint-screen.tsx`), as in the live panel.
 */

const dayOf = (iso: string) => (iso ? iso.slice(0, 10) : "");

export function SprintDetailsDialog({ projectId, sprint, open, onClose }: { projectId: string; sprint: SprintDTO | null; open: boolean; onClose: () => void }) {
  const update = useUpdateSprint(projectId);
  const [draft, setDraft] = React.useState({ name: "", goal: "", startDate: "", endDate: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open && sprint) {
      setDraft({ name: sprint.name, goal: sprint.goal ?? "", startDate: dayOf(sprint.startDate), endDate: dayOf(sprint.endDate) });
      setError(null);
    }
  }
  const datesInvalid = Boolean(draft.startDate && draft.endDate && draft.endDate < draft.startDate);
  const canSave = draft.name.trim() !== "" && draft.startDate !== "" && draft.endDate !== "" && !datesInvalid && !update.isPending;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sprint || !canSave) return;
    setError(null);
    update.mutate(
      { sprintId: sprint.id, name: draft.name.trim(), goal: draft.goal.trim() || null, startDate: draft.startDate, endDate: draft.endDate },
      { onSuccess: onClose, onError: (err) => setError(errorText(err)) },
    );
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="sprint-details-dialog">
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>Sprint details</DialogTitle>
            <DialogDescription>Its name, what it is for, and when it runs.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sprint-name">Name</Label>
              <Input id="sprint-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} required maxLength={120} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sprint-goal">Goal</Label>
              <Textarea id="sprint-goal" rows={2} value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))} placeholder="What this sprint should achieve (optional)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sprint-start">Starts</Label>
                <Input id="sprint-start" type="date" value={draft.startDate} onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sprint-end">Ends</Label>
                <Input id="sprint-end" type="date" value={draft.endDate} onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))} required aria-invalid={datesInvalid || undefined} />
              </div>
            </div>
            {datesInvalid && <ErrorNote>{SPRINT_DATE_RANGE_ERROR}</ErrorNote>}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave} data-testid="sprint-details-save">
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Marks a finished sprint as accepted by the client — on their behalf, so it is acknowledged first. */
export function ShipSprintDialog({ projectId, sprint, open, onClose }: { projectId: string; sprint: SprintDTO | null; open: boolean; onClose: () => void }) {
  const move = useSetSprintColumn(projectId);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Mark as shipped"
      description={sprint ? `Moving "${sprint.name}" to Shipped records it as accepted by the client. You are approving it on their behalf and will be held responsible for that decision.` : ""}
      confirmLabel="I acknowledge"
      busyLabel="Shipping…"
      onConfirm={() => (sprint ? move.mutateAsync({ sprintId: sprint.id, column: "SHIPPED" }) : undefined)}
      testId="ship-sprint-dialog"
    />
  );
}

/** Deleting a sprint frees its tasks back to the backlog; the name must be typed to go through. */
export function DeleteSprintDialog({ projectId, sprint, open, onClose }: { projectId: string; sprint: SprintDTO | null; open: boolean; onClose: () => void }) {
  const del = useDeleteSprint(projectId);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Delete sprint"
      description={sprint ? `"${sprint.name}" and its plan are removed for good. Its tasks go back to the backlog.` : ""}
      confirmLabel="Delete sprint"
      busyLabel="Deleting…"
      destructive
      typed={sprint ? { label: "Type the sprint's name to confirm", expected: sprint.name } : undefined}
      onConfirm={() => (sprint ? del.mutateAsync({ sprintId: sprint.id, confirmName: sprint.name }) : undefined)}
      testId="delete-sprint-dialog"
    />
  );
}
