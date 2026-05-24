"use client";

import { useState, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Trash2, Gavel, ArrowLeft, Clock, History, User, Pencil, Sparkles, Wrench, Bug, AlertCircle, Palette, ExternalLink } from "lucide-react";
import { createMeetingNote, updateMeetingNote, deleteMeetingNote } from "@/actions/meeting-note";
import { RichTextEditor } from "@/components/rich-text-editor";
import { cn } from "@/lib/utils";

type NoteType = "MEETING_NOTE" | "DECISION" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";

const NOTE_TYPE_CONFIG: Record<NoteType, { label: string; color: string; bgColor: string; icon: typeof FileText }> = {
  MEETING_NOTE: { label: "Meeting Note", color: "text-primary", bgColor: "bg-primary/10 border-primary/20", icon: FileText },
  DECISION: { label: "Decision", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/20", icon: Gavel },
  FEATURE: { label: "Feature", color: "text-primary", bgColor: "bg-primary/10 border-primary/20", icon: Sparkles },
  ENHANCEMENT: { label: "Enhancement", color: "text-violet-400", bgColor: "bg-violet-500/10 border-violet-500/20", icon: Wrench },
  BUG: { label: "Bug", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/20", icon: Bug },
  REPORTED_BUG: { label: "Reported Bug", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20", icon: AlertCircle },
  DESIGN: { label: "Design", color: "text-cyan-400", bgColor: "bg-cyan-500/10 border-cyan-500/20", icon: Palette },
};

interface NoteHistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
}

interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: Date;
  noteType: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; imageUrl: string | null };
  task: { id: string; title: string; taskNumber: number; taskType: string } | null;
  history?: NoteHistoryEntry[];
}

interface Props {
  notes: MeetingNote[];
  projectId: string;
  canEdit: boolean;
}

const ALL_NOTE_TYPES: NoteType[] = ["MEETING_NOTE", "DECISION", "FEATURE", "ENHANCEMENT", "BUG", "REPORTED_BUG", "DESIGN"];
const STANDALONE_NOTE_TYPES: NoteType[] = ["MEETING_NOTE", "DECISION"];

export function MeetingNotesTab({ notes, projectId, canEdit }: Props) {
  const [filter, setFilter] = useState<NoteType | "ALL">("ALL");
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null);

  const filtered = useMemo(() => {
    if (filter === "ALL") return notes;
    return notes.filter((n) => n.noteType === filter);
  }, [notes, filter]);

  const usedTypes = useMemo(() => {
    const types = new Set(notes.map((n) => n.noteType));
    return ALL_NOTE_TYPES.filter((t) => types.has(t));
  }, [notes]);

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

  if (view === "create") {
    return <NoteFullScreenCreate projectId={projectId} onBack={goBack} />;
  }

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Notes</h2>
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5 flex-wrap">
            {(["ALL" as const, ...usedTypes]).map((t) => (
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
                  {note.task && (
                    <span className="ml-2 text-muted-foreground/50">
                      · linked to {note.task.taskType === "BUG" ? "B" : note.task.taskType === "REPORTED_BUG" ? "RB" : note.task.taskType === "ENHANCEMENT" ? "E" : note.task.taskType === "DESIGN" ? "D" : "F"}-{String(note.task.taskNumber).padStart(3, "0")}
                    </span>
                  )}
                  {(note.history?.length ?? 0) > 0 && (
                    <span className="ml-2 text-muted-foreground/50">
                      · edited {note.history!.length} time{note.history!.length > 1 ? "s" : ""}
                    </span>
                  )}
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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 sm:px-16 py-10">
          {/* Type picker */}
          <div className="mb-6">
            <div className="flex gap-2">
              {STANDALONE_NOTE_TYPES.map((id) => {
                const cfg = NOTE_TYPE_CONFIG[id];
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

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={noteType === "DECISION" ? "What was decided?" : "Meeting title..."}
            className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-4"
            autoFocus
          />

          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border/50">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto text-[13px] h-8"
            />
          </div>

          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder={noteType === "DECISION" ? "Describe the context, options considered, and rationale... (type / for commands)" : "Write your meeting notes here... (type / for commands)"}
            borderless
          />
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
  const [showHistory, setShowHistory] = useState(false);

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
          {(note.history?.length ?? 0) > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className={cn(showHistory && "bg-accent")}
            >
              <History className="w-3.5 h-3.5 mr-1.5" />
              History
              <span className="ml-1 text-[10px] text-muted-foreground">({note.history!.length})</span>
            </Button>
          )}
          {canEdit && !isEditing && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
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

      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 sm:px-16 py-10">
            {/* Type badge + meta */}
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {config && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.bgColor} ${config.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </span>
              )}
              <span className="text-[13px] text-muted-foreground">
                {format(new Date(note.date), "MMMM d, yyyy")}
              </span>
            </div>

            {/* Created by + timestamps + linked task */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-6 text-[12px] text-muted-foreground/70">
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" />
                Created by {note.author.name ?? "Unknown"}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
              {note.task && (
                <>
                  <span>·</span>
                  <button
                    onClick={() => {
                      onBack();
                      window.history.replaceState(null, "", `?tab=board&task=${note.task!.id}`);
                      window.location.href = `?tab=board&task=${note.task!.id}`;
                    }}
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="font-mono font-medium">{note.task.taskType === "BUG" ? "B" : note.task.taskType === "REPORTED_BUG" ? "RB" : note.task.taskType === "ENHANCEMENT" ? "E" : note.task.taskType === "DESIGN" ? "D" : "F"}-{String(note.task.taskNumber).padStart(3, "0")}</span>
                    {note.task.title}
                  </button>
                </>
              )}
              {(note.history?.length ?? 0) > 0 && (
                <>
                  <span>·</span>
                  <span>
                    Last edited {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            {isEditing ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-8"
                autoFocus
              />
            ) : (
              <h1 className="text-4xl font-bold mb-8">{note.title}</h1>
            )}

            {/* Content */}
            {isEditing ? (
              <RichTextEditor content={content} onChange={setContent} borderless />
            ) : (
              <div
                className="prose prose-invert max-w-none text-base leading-relaxed"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            )}
          </div>
        </div>

        {/* History sidebar */}
        {showHistory && (note.history?.length ?? 0) > 0 && (
          <div className="w-72 border-l border-border bg-card/50 overflow-y-auto shrink-0">
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <History className="w-4 h-4" />
                Edit History
              </h3>
              <div className="space-y-0">
                {note.history!.map((entry, idx) => (
                  <div key={entry.id} className="relative pl-5">
                    {idx < note.history!.length - 1 && (
                      <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
                    )}
                    {/* Timeline dot */}
                    <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-border bg-background flex items-center justify-center">
                      <Pencil className="w-2 h-2 text-muted-foreground" />
                    </div>
                    <div className="pb-5">
                      <p className="text-[12px] font-medium text-foreground">
                        {entry.user.name ?? "Unknown"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {entry.field === "title" ? (
                          <>
                            Changed title
                            {entry.oldValue && (
                              <span className="block mt-0.5">
                                <span className="line-through text-muted-foreground/40">{entry.oldValue}</span>
                                {" → "}
                                <span className="text-foreground/80">{entry.newValue}</span>
                              </span>
                            )}
                          </>
                        ) : entry.field === "content" ? (
                          "Updated content"
                        ) : (
                          `Changed ${entry.field}`
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
