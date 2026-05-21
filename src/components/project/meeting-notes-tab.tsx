"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FileText, Trash2 } from "lucide-react";
import { createMeetingNote, deleteMeetingNote } from "@/actions/meeting-note";
import { RichTextEditor } from "@/components/rich-text-editor";

interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: Date;
  author: { id: string; name: string | null; imageUrl: string | null };
}

interface Props {
  notes: MeetingNote[];
  projectId: string;
  canEdit: boolean;
}

export function MeetingNotesTab({ notes, projectId, canEdit }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      await createMeetingNote({
        projectId,
        title: formData.get("title") as string,
        content,
        date: formData.get("date") as string,
      });
      setOpen(false);
      setContent("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(noteId: string) {
    try {
      await deleteMeetingNote(noteId);
      setSelectedNote(null);
    } catch (err) {
      console.error(err);
    }
  }

  if (selectedNote) {
    return (
      <div>
        <button
          onClick={() => setSelectedNote(null)}
          className="mb-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to notes
        </button>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">{selectedNote.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {format(new Date(selectedNote.date), "MMMM d, yyyy")} ·{" "}
                {selectedNote.author.name ?? "Unknown"}
              </p>
            </div>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(selectedNote.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div
            className="prose prose-invert mt-4 max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: selectedNote.content }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Meeting Notes</h2>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Note
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New Meeting Note</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" required placeholder="Sprint Review" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <RichTextEditor content={content} onChange={setContent} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save Note"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">No meeting notes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedNote(note)}
              className="w-full text-left rounded-lg border border-border/60 bg-card p-4 hover:border-border transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{note.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(note.date), "MMM d, yyyy")}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                by {note.author.name ?? "Unknown"}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
