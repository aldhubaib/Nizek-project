"use client";

import * as React from "react";

import { taskCode } from "@/lib/task-label";
import { useCreateNote, useDeleteNote, useUpdateNote, type NoteDetail, type NoteRow } from "@/next-ui/data/notes";
import { useProjectTasks } from "@/next-ui/data/tasks";
import { ConfirmDialog, ErrorNote, errorText } from "@/next-ui/patterns/form-bits";
import { RichTextEditor } from "@/next-ui/patterns/rich-text-editor";
import { Button } from "@/next-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";

import { NOTE_TYPES, noteType } from "./note-marks";
import { TaskTypeIcon } from "./task-marks";

/**
 * Writing a note: its kind, title, date, body, and the task it is about; a road-map item also
 * takes a due date and an effort in working days. The same dialog edits an existing note (the
 * kind is fixed then). Sprint documents are written by the sprint and are not edited here.
 */

/** The kinds a person picks for a new note; sprint documents come from sprints. */
export const WRITABLE_NOTE_TYPES = ["MEETING_NOTE", "DECISION", "CLARIFICATION", "DEADLINE", "FEATURE", "ENHANCEMENT", "BUG", "REPORTED_BUG", "DESIGN"] as const;
export type WritableNoteType = (typeof WRITABLE_NOTE_TYPES)[number];

const today = () => new Date().toISOString().slice(0, 10);
const dayOf = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");

type Draft = { noteType: WritableNoteType; title: string; date: string; dueDate: string; workingDays: string; taskId: string; content: string };

function draftOf(note: NoteDetail | NoteRow | null): Draft {
  if (!note) return { noteType: "MEETING_NOTE", title: "", date: today(), dueDate: "", workingDays: "", taskId: "none", content: "" };
  const detail = note as Partial<NoteDetail>;
  return {
    noteType: (WRITABLE_NOTE_TYPES as readonly string[]).includes(note.noteType) ? (note.noteType as WritableNoteType) : "MEETING_NOTE",
    title: note.title,
    date: dayOf(note.date),
    dueDate: dayOf(note.dueDate),
    workingDays: detail.workingDays != null ? String(detail.workingDays) : "",
    taskId: note.task?.id ?? "none",
    content: note.content ?? "",
  };
}

export function NoteDialog({ projectId, note, open, onClose, onCreated }: { projectId: string; note: NoteDetail | NoteRow | null; open: boolean; onClose: () => void; onCreated?: (noteId: string) => void }) {
  const create = useCreateNote(projectId);
  const update = useUpdateNote(projectId);
  const tasks = useProjectTasks(projectId);
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(note));
  const [error, setError] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setDraft(draftOf(note));
      setError(null);
    }
  }
  const editing = note != null;
  const roadmap = draft.noteType === "DEADLINE";
  const busy = create.isPending || update.isPending;
  const canSave = draft.title.trim() !== "" && draft.date !== "" && !busy;
  const taskOptions = (tasks.data ?? []).slice().sort((a, b) => b.taskNumber - a.taskNumber);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    const fail = (err: unknown) => setError(errorText(err));
    if (editing) {
      const changes: Parameters<typeof update.mutate>[0] = { noteId: note.id };
      if (draft.title.trim() !== note.title) changes.title = draft.title.trim();
      if (draft.date !== dayOf(note.date)) changes.date = draft.date;
      if ((draft.content || "") !== (note.content ?? "")) changes.content = draft.content;
      if (roadmap) {
        if (draft.dueDate !== dayOf(note.dueDate)) changes.dueDate = draft.dueDate || null;
        const was = (note as Partial<NoteDetail>).workingDays;
        if (draft.workingDays !== (was != null ? String(was) : "")) changes.workingDays = draft.workingDays === "" ? null : draft.workingDays;
      }
      if (Object.keys(changes).length === 1) {
        onClose();
        return;
      }
      update.mutate(changes, { onSuccess: onClose, onError: fail });
      return;
    }
    create.mutate(
      {
        title: draft.title.trim(),
        content: draft.content,
        date: draft.date,
        noteType: draft.noteType,
        dueDate: roadmap && draft.dueDate ? draft.dueDate : undefined,
        workingDays: roadmap && draft.workingDays !== "" ? draft.workingDays : undefined,
        taskId: draft.taskId !== "none" ? draft.taskId : undefined,
      },
      {
        onSuccess: (created) => {
          onClose();
          if (created?.id) onCreated?.(created.id);
        },
        onError: fail,
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl" data-testid="note-dialog">
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle>
            <DialogDescription>{editing ? "Its title, dates and text." : "A meeting note, a decision, a clarification, a road-map item or a write-up for a task."}</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
            <div className="grid gap-4 @sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="note-kind">Kind</Label>
                <Select value={draft.noteType} onValueChange={(v) => setDraft((d) => ({ ...d, noteType: v as WritableNoteType }))} disabled={editing}>
                  <SelectTrigger id="note-kind" className="w-full" data-testid="note-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WRITABLE_NOTE_TYPES.map((t) => {
                      const cfg = noteType(t);
                      const Icon = cfg.icon;
                      return (
                        <SelectItem key={t} value={t}>
                          <Icon className={cfg.color} />
                          {cfg.label}
                        </SelectItem>
                      );
                    })}
                    {editing && !(WRITABLE_NOTE_TYPES as readonly string[]).includes(note.noteType) && <SelectItem value={note.noteType}>{NOTE_TYPES[note.noteType]?.label ?? note.noteType}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="note-title">Title</Label>
                <Input id="note-title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required maxLength={200} autoFocus dir="auto" data-testid="note-title" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 @sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="note-date">Date</Label>
                <Input id="note-date" type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} required />
              </div>
              {roadmap && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="note-due">Due</Label>
                    <Input id="note-due" type="date" value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="note-effort">Effort (working days)</Label>
                    <Input id="note-effort" type="number" min={0} step={0.5} inputMode="decimal" value={draft.workingDays} onChange={(e) => setDraft((d) => ({ ...d, workingDays: e.target.value }))} placeholder="e.g. 5" />
                  </div>
                </>
              )}
            </div>
            {!editing && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="note-task">About a task</Label>
                <Select value={draft.taskId} onValueChange={(v) => setDraft((d) => ({ ...d, taskId: v }))}>
                  <SelectTrigger id="note-task" className="w-full">
                    <SelectValue placeholder="No task" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No task</SelectItem>
                    {taskOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <TaskTypeIcon taskType={t.taskType} className="size-3.5" />
                        <span className="font-mono text-xs text-muted-foreground">{taskCode(t.taskType, t.taskNumber)}</span>
                        <span className="truncate">{t.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note-body">Text</Label>
              <RichTextEditor id="note-body" value={draft.content} onChange={(html) => setDraft((d) => ({ ...d, content: html }))} placeholder="Write the note…" minHeight="12rem" data-testid="note-body-editor" />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave} data-testid="note-save">
              {busy ? "Saving…" : editing ? "Save" : "Add note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteNoteDialog({ projectId, note, open, onClose, onDeleted }: { projectId: string; note: { id: string; title: string } | null; open: boolean; onClose: () => void; onDeleted?: () => void }) {
  const del = useDeleteNote(projectId);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Delete note"
      description={note ? `"${note.title}" and its comments are removed for good.` : ""}
      confirmLabel="Delete note"
      busyLabel="Deleting…"
      destructive
      onConfirm={async () => {
        if (!note) return;
        await del.mutateAsync(note.id);
        onDeleted?.();
      }}
      testId="delete-note-dialog"
    />
  );
}
