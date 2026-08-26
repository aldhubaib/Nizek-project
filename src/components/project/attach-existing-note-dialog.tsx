"use client";

import { useEffect, useState } from "react";
import { Loader2, CalendarClock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  attachNoteToTask,
  searchProjectNotesForLink,
} from "@/actions/meeting-note";

type NoteRow = {
  id: string;
  title: string;
  noteType: string;
  date: Date | string;
  author: { name: string | null };
};

export function AttachExistingNoteDialog({
  open,
  onClose,
  projectId,
  taskId,
  onAttached,
  kind = "notes",
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  taskId: string;
  onAttached: () => void;
  kind?: "notes" | "roadmap";
}) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRoadmap = kind === "roadmap";
  const Icon = isRoadmap ? CalendarClock : FileText;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setNotes([]);
    setError(null);
  }, [open, projectId, taskId, kind]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      searchProjectNotesForLink(projectId, taskId, query, { kind })
        .then((rows) => {
          setNotes(rows as NoteRow[]);
          setError(null);
        })
        .catch((err) => {
          setNotes([]);
          setError(err instanceof Error ? err.message : "Failed to load notes");
        })
        .finally(() => setLoading(false));
    }, query ? 200 : 0);
    return () => clearTimeout(t);
  }, [query, open, projectId, taskId, kind]);

  async function attach(noteId: string) {
    setAttaching(noteId);
    setError(null);
    try {
      await attachNoteToTask({ noteId, taskId });
      onAttached();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach");
    } finally {
      setAttaching(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-s">
            <Icon className="h-4 w-4 text-primary" />
            {isRoadmap ? "Attach existing roadmap item" : "Attach existing note"}
          </DialogTitle>
        </DialogHeader>
        <div className="p-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isRoadmap ? "Search roadmap…" : "Search notes…"}
            className="h-9"
            autoFocus
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <p className="px-2 py-8 text-center text-s text-muted-foreground">
              {isRoadmap ? "No matching roadmap items" : "No matching notes"}
            </p>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                type="button"
                disabled={attaching !== null}
                onClick={() => void attach(n.id)}
                className="flex w-full flex-col rounded-lg px-2 py-2 text-start hover:bg-accent/60"
              >
                <span className="truncate text-s font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">
                  {n.author.name ?? "Unknown"}
                  {attaching === n.id ? " · attaching…" : ""}
                </span>
              </button>
            ))
          )}
        </div>
        {error && (
          <p className="px-4 pb-3 text-s text-destructive">{error}</p>
        )}
        <div className="border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
