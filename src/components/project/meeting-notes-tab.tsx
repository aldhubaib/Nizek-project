"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Trash2, Gavel, ArrowLeft, X } from "lucide-react";
import { createMeetingNote, updateMeetingNote, deleteMeetingNote } from "@/actions/meeting-note";
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
  const [filter, setFilter] = useState<NoteType | "ALL">("ALL");
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null);

  const filtered = useMemo(() => {
    if (filter === "ALL") return notes;
    return notes.filter((n) => n.noteType === filter);
  }, [notes, filter]);

  function openNote(note: MeetingNote) {
    setSelectedNote(note);
    setView("detail");
  }

  function openCreate() {
    setView("create");
  }

  function goBack() {
    setView("list");
    setSelectedNote(null);
  }

  // Full-screen create view
  if (view === "create") {
    return <NoteFullScreenCreate projectId={projectId} onBack={goBack} />;
  }

  // Full-screen detail view
  if (view === "detail" && selectedNote) {
    return (
      <NoteFullScreenDetail
        note={selectedNote}
        canEdit={canEdit}
        onBack={goBack}
        onDelete={async () => {
          await deleteMeetingNote(selectedNote.id);
          goBack();
        }}
      />
    );
  }

  // List view
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
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Note
          </Button>
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
                onClick={() => openNote(note)}
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

/* ─── Full-screen create ─── */

function NoteFullScreenCreate({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [noteType, setNoteType] = useState<NoteType | null>(null);
  const [saving, setSaving] = useState(false);
  const [typeError, setTypeError] = useState(false);

  async function handleSave() {
    if (!noteType) { setTypeError(true); return; }
    if (!title.trim()) return;
    setTypeError(false);
    setSaving(true);
    try {
      await createMeetingNote({ projectId, title: title.trim(), content, date, noteType });
      onBack();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">
          {/* Type picker */}
          <div className="mb-6">
            <div className="flex gap-2">
              {(Object.entries(NOTE_TYPE_CONFIG) as [NoteType, typeof NOTE_TYPE_CONFIG[NoteType]][]).map(([id, cfg]) => {
                const Icon = cfg.icon;
                const isActive = noteType === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setNoteType(id); setTypeError(false); }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors",
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
            {typeError && <p className="text-[11px] text-destructive mt-1.5">Please select a type</p>}
          </div>

          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={noteType === "DECISION" ? "What was decided?" : "Meeting title..."}
            className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-4"
            autoFocus
          />

          {/* Date */}
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border/50">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto text-[13px] h-8"
            />
          </div>

          {/* Editor */}
          <div className="[&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:text-base [&_.ProseMirror]:leading-relaxed">
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder={noteType === "DECISION" ? "Describe the context, options considered, and rationale..." : "Write your meeting notes here..."}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Full-screen detail ─── */

function NoteFullScreenDetail({
  note,
  canEdit,
  onBack,
  onDelete,
}: {
  note: MeetingNote;
  canEdit: boolean;
  onBack: () => void;
  onDelete: () => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const config = NOTE_TYPE_CONFIG[(note.noteType as NoteType) ?? "MEETING_NOTE"];
  const Icon = config?.icon ?? FileText;

  async function handleSave() {
    setSaving(true);
    try {
      await updateMeetingNote({ noteId: note.id, title: title.trim(), content });
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      console.error(err);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="text-destructive hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {isEditing && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setTitle(note.title); setContent(note.content); }}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">
          {/* Type badge + meta */}
          <div className="flex items-center gap-3 mb-4">
            {config && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.bgColor} ${config.color}`}>
                <Icon className="w-3.5 h-3.5" />
                {config.label}
              </span>
            )}
            <span className="text-[13px] text-muted-foreground">
              {format(new Date(note.date), "MMMM d, yyyy")}
            </span>
            <span className="text-[13px] text-muted-foreground/50">·</span>
            <span className="text-[13px] text-muted-foreground">
              {note.author.name ?? "Unknown"}
            </span>
          </div>

          {/* Title */}
          {isEditing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-8"
              autoFocus
            />
          ) : (
            <h1 className="text-3xl font-bold mb-8">{note.title}</h1>
          )}

          {/* Content */}
          {isEditing ? (
            <div className="[&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:text-base [&_.ProseMirror]:leading-relaxed">
              <RichTextEditor content={content} onChange={setContent} />
            </div>
          ) : (
            <div
              className="prose prose-invert max-w-none text-base leading-relaxed"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
