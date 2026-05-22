"use client";

import { useState, useMemo } from "react";
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
import { Plus, FileText, Trash2, Gavel } from "lucide-react";
import { createMeetingNote, deleteMeetingNote } from "@/actions/meeting-note";
import { RichTextEditor } from "@/components/rich-text-editor";
import { cn } from "@/lib/utils";

type NoteType = "MEETING_NOTE" | "DECISION";

const NOTE_TYPE_CONFIG: Record<NoteType, { label: string; color: string; bgColor: string; icon: typeof FileText }> = {
  MEETING_NOTE: { label: "Meeting Note", color: "text-primary", bgColor: "bg-primary/10 border-primary/20", icon: FileText },
  DECISION: { label: "Decision", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/20", icon: Gavel },
};

interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: Date;
  noteType: string;
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
  const [noteType, setNoteType] = useState<NoteType | null>(null);
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null);
  const [filter, setFilter] = useState<NoteType | "ALL">("ALL");

  const filtered = useMemo(() => {
    if (filter === "ALL") return notes;
    return notes.filter((n) => n.noteType === filter);
  }, [notes, filter]);

  const [typeError, setTypeError] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!noteType) {
      setTypeError(true);
      return;
    }
    setTypeError(false);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      await createMeetingNote({
        projectId,
        title: formData.get("title") as string,
        content,
        date: formData.get("date") as string,
        noteType,
      });
      setOpen(false);
      setContent("");
      setNoteType(null);
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
    const config = NOTE_TYPE_CONFIG[(selectedNote.noteType as NoteType) ?? "MEETING_NOTE"];
    const Icon = config?.icon ?? FileText;
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
              <div className="flex items-center gap-2 mb-1">
                {config && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.bgColor} ${config.color}`}>
                    <Icon className="w-3 h-3" />
                    {config.label}
                  </span>
                )}
              </div>
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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Notes</h2>
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
            {(["ALL", "MEETING_NOTE", "DECISION"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                  filter === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "ALL" ? "All" : NOTE_TYPE_CONFIG[t].label}
                <span className="ml-1 text-[10px] opacity-60">
                  {t === "ALL" ? notes.length : notes.filter((n) => n.noteType === t).length}
                </span>
              </button>
            ))}
          </div>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setContent(""); setNoteType(null); setTypeError(false); } }}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Note
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New Note</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                {/* Type picker */}
                <div className="space-y-2">
                  <Label>Type <span className="text-destructive">*</span></Label>
                  <div className="flex gap-2">
                    {(Object.entries(NOTE_TYPE_CONFIG) as [NoteType, typeof NOTE_TYPE_CONFIG[NoteType]][]).map(([id, cfg]) => {
                      const Icon = cfg.icon;
                      const isActive = noteType === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => { setNoteType(id); setTypeError(false); }}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-medium transition-colors flex-1",
                            isActive ? `${cfg.bgColor} ${cfg.color}` : "border-border text-muted-foreground hover:border-muted-foreground/40",
                            typeError && !isActive && "border-destructive/40"
                          )}
                        >
                          <Icon className="w-4 h-4" strokeWidth={1.5} />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                  {typeError && (
                    <p className="text-[11px] text-destructive">Please select a type</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    required
                    placeholder={noteType === "DECISION" ? "e.g. Use PostgreSQL for the database" : "e.g. Sprint Review"}
                  />
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
                    {loading ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">
            {filter === "ALL" ? "No notes yet" : `No ${NOTE_TYPE_CONFIG[filter].label.toLowerCase()}s yet`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((note) => {
            const config = NOTE_TYPE_CONFIG[(note.noteType as NoteType) ?? "MEETING_NOTE"];
            const Icon = config?.icon ?? FileText;
            return (
              <button
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className="w-full text-left rounded-lg border border-border/60 bg-card p-4 hover:border-border transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {config && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${config.bgColor} ${config.color}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {config.label}
                      </span>
                    )}
                    <h3 className="text-sm font-medium">{note.title}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {format(new Date(note.date), "MMM d, yyyy")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  by {note.author.name ?? "Unknown"}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
