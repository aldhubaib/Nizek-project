"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Trash2, Gavel, ArrowLeft, Clock, History, User, Pencil, Sparkles, Wrench, Bug, AlertCircle, Palette, ExternalLink, CalendarClock, CheckCircle2, Circle, MoreVertical } from "lucide-react";
import { createMeetingNote, updateMeetingNote, deleteMeetingNote, toggleDeadlineComplete, getMeetingNote } from "@/actions/meeting-note";
import { testDeadlineReminder } from "@/actions/deadline-reminder";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { NotificationBell } from "@/components/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEADLINE_REMINDER_TEST_SCENARIOS,
  type DeadlineMilestone,
  milestoneLabel,
} from "@/lib/deadline-milestones";
import {
  buildNoteTimeline,
} from "@/lib/note-timeline";
import { NoteTimelineSidebar } from "@/components/project/note-timeline-sidebar";
import { cn } from "@/lib/utils";

type NoteType = "MEETING_NOTE" | "DECISION" | "DEADLINE" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";

const NOTE_TYPE_CONFIG: Record<NoteType, { label: string; color: string; bgColor: string; icon: typeof FileText }> = {
  MEETING_NOTE: { label: "Meeting Note", color: "text-primary", bgColor: "bg-primary/10 border-primary/20", icon: FileText },
  DECISION: { label: "Decision", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/20", icon: Gavel },
  DEADLINE: { label: "Deadline", color: "text-rose-400", bgColor: "bg-rose-500/10 border-rose-500/20", icon: CalendarClock },
  FEATURE: { label: "Business Case", color: "text-primary", bgColor: "bg-primary/10 border-primary/20", icon: Sparkles },
  ENHANCEMENT: { label: "Enhancement", color: "text-violet-400", bgColor: "bg-violet-500/10 border-violet-500/20", icon: Wrench },
  BUG: { label: "Bug", color: "text-amber-400", bgColor: "bg-amber-500/10 border-amber-500/20", icon: Bug },
  REPORTED_BUG: { label: "Reported Bug", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20", icon: AlertCircle },
  DESIGN: { label: "Design", color: "text-cyan-400", bgColor: "bg-cyan-500/10 border-cyan-500/20", icon: Palette },
};

function getDeadlineStatus(dueDate: Date | string, completedAt: Date | string | null) {
  if (completedAt) return { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" };
  if (days === 0) return { label: "Due today", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" };
  if (days === 1) return { label: "Due tomorrow", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" };
  if (days <= 7) return { label: `${days}d left`, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" };
  return { label: `${days}d left`, color: "text-muted-foreground", bg: "bg-muted border-border" };
}

interface NoteHistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
}

interface ReminderLogEntry {
  id: string;
  offsetDays: number;
  sentAt: Date;
}

interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: Date;
  noteType: string;
  dueDate?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; imageUrl: string | null };
  task: { id: string; title: string; taskNumber: number; taskType: string } | null;
  history?: NoteHistoryEntry[];
  reminderLogs?: ReminderLogEntry[];
}

interface Props {
  notes: MeetingNote[];
  projectId: string;
  canEdit: boolean;
  currentUserId?: string;
  isSystemAdmin?: boolean;
  isDeadlineTestProject?: boolean;
}

const ALL_NOTE_TYPES: NoteType[] = ["MEETING_NOTE", "DECISION", "DEADLINE", "FEATURE", "ENHANCEMENT", "BUG", "REPORTED_BUG", "DESIGN"];
const STANDALONE_NOTE_TYPES: NoteType[] = ["MEETING_NOTE", "DECISION", "DEADLINE"];

export function MeetingNotesTab({
  notes: initialNotes,
  projectId,
  canEdit,
  currentUserId,
  isSystemAdmin = false,
  isDeadlineTestProject = false,
}: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [filter, setFilter] = useState<NoteType | "ALL">("ALL");
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  useEffect(() => {
    const noteId = searchParams.get("noteId");
    if (!noteId) return;
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      setSelectedNote(note);
      setView("detail");
    }
  }, [searchParams, notes]);

  const refreshNote = useCallback(async (noteId: string) => {
    const fresh = await getMeetingNote(noteId);
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? (fresh as unknown as MeetingNote) : n)),
    );
    setSelectedNote((prev) =>
      prev?.id === noteId ? (fresh as unknown as MeetingNote) : prev,
    );
  }, []);

  const toggleComplete = useCallback(async (noteId: string) => {
    const completedAt = await toggleDeadlineComplete(noteId);
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, completedAt } : n)),
    );
    setSelectedNote((prev) =>
      prev?.id === noteId ? { ...prev, completedAt } : prev,
    );
  }, []);

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
    return <NoteFullScreenCreate projectId={projectId} currentUserId={currentUserId} onBack={goBack} />;
  }

  if (view === "detail" && selectedNote) {
    return (
      <NoteFullScreenDetail
        note={selectedNote}
        canEdit={canEdit}
        isSystemAdmin={isSystemAdmin}
        isDeadlineTestProject={isDeadlineTestProject}
        onBack={goBack}
        onToggleComplete={() => toggleComplete(selectedNote.id)}
        onRefresh={() => refreshNote(selectedNote.id)}
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
            const cfg = NOTE_TYPE_CONFIG[(note.noteType as NoteType) ?? "MEETING_NOTE"];
            const Icon = cfg?.icon ?? FileText;
            const isDeadline = note.noteType === "DEADLINE";
            const deadlineStatus =
              isDeadline && note.dueDate
                ? getDeadlineStatus(note.dueDate, note.completedAt ?? null)
                : null;

            return (
              <div
                key={note.id}
                className={cn(
                  "w-full text-left rounded-lg border border-border/60 bg-card p-4 hover:border-border transition-colors",
                  note.completedAt && "opacity-60"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isDeadline && canEdit && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await toggleComplete(note.id);
                        }}
                        className="shrink-0"
                        title={note.completedAt ? "Mark incomplete" : "Mark complete"}
                      >
                        {note.completedAt ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground/40 hover:text-primary transition-colors" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => openNote(note)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      {cfg && (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${cfg.bgColor} ${cfg.color}`}>
                          <Icon className="w-2.5 h-2.5" />
                          {cfg.label}
                        </span>
                      )}
                      <h3 className={cn("text-sm font-medium truncate", note.completedAt && "line-through")}>{note.title}</h3>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {deadlineStatus && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${deadlineStatus.bg} ${deadlineStatus.color}`}>
                        {deadlineStatus.label}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {isDeadline
                        ? format(new Date(note.dueDate!), "MMM d, yyyy")
                        : format(new Date(note.date), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
                <button onClick={() => openNote(note)} className="w-full text-left">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Full-screen create ─── */

function NoteFullScreenCreate({
  projectId,
  currentUserId,
  onBack,
}: {
  projectId: string;
  currentUserId?: string;
  onBack: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [noteType, setNoteType] = useState<NoteType | null>(null);
  const [saving, setSaving] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [dueDateError, setDueDateError] = useState(false);

  const isDeadline = noteType === "DEADLINE";

  async function handleSave() {
    if (!noteType) { setTypeError(true); return; }
    if (!title.trim()) return;
    if (isDeadline && !dueDate) { setDueDateError(true); return; }
    setTypeError(false);
    setDueDateError(false);
    setSaving(true);
    try {
      await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date,
        noteType,
        ...(isDeadline && dueDate ? { dueDate } : {}),
      });
      onBack();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const placeholders: Record<string, string> = {
    DECISION: "What was decided?",
    DEADLINE: "Deadline title...",
    MEETING_NOTE: "Meeting title...",
  };

  const editorPlaceholders: Record<string, string> = {
    DECISION: "Describe the context, options considered, and rationale... (type / for commands)",
    DEADLINE: "Notes about this deadline... (type / for commands)",
    MEETING_NOTE: "Write your meeting notes here... (type / for commands)",
  };

  return (
    <div className="fixed inset-0 z-[110] bg-background flex flex-col">
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <NotificationBell currentUserId={currentUserId} />
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 sm:px-16 py-10">
          {/* Type picker */}
          <div className="mb-6">
            <div className="flex gap-2 flex-wrap">
              {STANDALONE_NOTE_TYPES.map((id) => {
                const cfg = NOTE_TYPE_CONFIG[id];
                const Icon = cfg.icon;
                const isActive = noteType === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setNoteType(id); setTypeError(false); setDueDateError(false); }}
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
            placeholder={placeholders[noteType ?? "MEETING_NOTE"] ?? "Title..."}
            className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-4"
            autoFocus
          />

          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border/50">
            {isDeadline ? (
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Due Date *</label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => { setDueDate(e.target.value); setDueDateError(false); }}
                    className={cn("w-auto text-[13px] h-8", dueDateError && "border-destructive")}
                  />
                  {dueDateError && <p className="text-[10px] text-destructive mt-0.5">Required</p>}
                </div>
              </div>
            ) : (
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-auto text-[13px] h-8"
              />
            )}
          </div>

          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder={editorPlaceholders[noteType ?? "MEETING_NOTE"] ?? "Write here... (type / for commands)"}
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
  isSystemAdmin,
  isDeadlineTestProject,
  onBack,
  onToggleComplete,
  onRefresh,
  onDelete,
}: {
  note: MeetingNote;
  canEdit: boolean;
  isSystemAdmin?: boolean;
  isDeadlineTestProject?: boolean;
  onBack: () => void;
  onToggleComplete: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [completedAt, setCompletedAt] = useState<Date | string | null>(
    note.completedAt ?? null,
  );
  const [togglingComplete, setTogglingComplete] = useState(false);
  const [testingMilestone, setTestingMilestone] = useState<number | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const timeline = useMemo(
    () =>
      buildNoteTimeline({
        id: note.id,
        noteType: note.noteType,
        createdAt: note.createdAt,
        author: note.author,
        history: note.history,
        reminderLogs: note.reminderLogs,
      }),
    [note],
  );

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setCompletedAt(note.completedAt ?? null);
  }, [note]);

  const config = NOTE_TYPE_CONFIG[(note.noteType as NoteType) ?? "MEETING_NOTE"];
  const Icon = config?.icon ?? FileText;
  const isDeadline = note.noteType === "DEADLINE";
  const deadlineStatus =
    isDeadline && note.dueDate
      ? getDeadlineStatus(note.dueDate, completedAt)
      : null;

  async function handleToggleComplete() {
    setTogglingComplete(true);
    try {
      await onToggleComplete();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingComplete(false);
    }
  }

  async function handleTestReminder(offsetDays: DeadlineMilestone) {
    setTestingMilestone(offsetDays);
    setTestMessage(null);
    try {
      const result = await testDeadlineReminder(note.id, offsetDays);
      setTestMessage(result.ok ? "Sent to project chat" : result.error);
      if (result.ok) {
        await onRefresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send test reminder";
      setTestMessage(msg);
      console.error(err);
    } finally {
      setTestingMilestone(null);
    }
  }

  const showReminderTests =
    Boolean(isSystemAdmin && isDeadlineTestProject && isDeadline);

  async function handleSave() {
    setSaving(true);
    try {
      await updateMeetingNote({ noteId: note.id, title: title.trim(), content });
      await onRefresh();
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
    <div className="fixed inset-0 z-[110] bg-background flex flex-col">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className={cn(showHistory && "bg-accent")}
            >
              <History className="w-3.5 h-3.5 mr-1.5" />
              History
            </Button>
          )}
          {canEdit && !isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Note options"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {isDeadline && (
                  <DropdownMenuItem
                    onClick={handleToggleComplete}
                    disabled={togglingComplete}
                    className={cn(completedAt && "text-emerald-400 focus:text-emerald-400")}
                  >
                    {completedAt ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    <span className="flex-1">{completedAt ? "Mark incomplete" : "Mark complete"}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  <span className="flex-1">Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowHistory(true)}>
                  <History className="h-4 w-4" />
                  <span className="flex-1">History</span>
                </DropdownMenuItem>
                {showReminderTests && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <CalendarClock className="h-4 w-4" />
                        <span className="flex-1">Test reminders</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                            Post to project chat @ all
                          </DropdownMenuLabel>
                          {DEADLINE_REMINDER_TEST_SCENARIOS.map((offsetDays) => (
                            <DropdownMenuItem
                              key={offsetDays}
                              disabled={testingMilestone !== null}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                void handleTestReminder(offsetDays);
                              }}
                            >
                              <span className="flex-1">{milestoneLabel(offsetDays)}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="flex-1">Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              {deadlineStatus && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${deadlineStatus.bg} ${deadlineStatus.color}`}>
                  {deadlineStatus.label}
                </span>
              )}
              <span className="text-[13px] text-muted-foreground">
                {isDeadline
                  ? `Due ${format(new Date(note.dueDate!), "MMMM d, yyyy")}`
                  : format(new Date(note.date), "MMMM d, yyyy")}
              </span>
            </div>

            {isDeadline && canEdit && (
              <>
                <button
                  onClick={handleToggleComplete}
                  disabled={togglingComplete}
                  className={cn(
                    "mb-4 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50",
                    completedAt
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {completedAt ? (
                    <><CheckCircle2 className="w-4 h-4" /> Completed</>
                  ) : (
                    <><Circle className="w-4 h-4" /> Mark as complete</>
                  )}
                </button>
                {testMessage && (
                  <p className="mb-4 text-[11px] text-muted-foreground">{testMessage}</p>
                )}
              </>
            )}

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
              <h1 className={cn("text-4xl font-bold mb-8", completedAt && "line-through opacity-60")}>
                {note.title}
              </h1>
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
        {showHistory && <NoteTimelineSidebar events={timeline} />}
      </div>
    </div>
  );
}
