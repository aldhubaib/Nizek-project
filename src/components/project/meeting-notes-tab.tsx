"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FileText, Trash2, Gavel, Clock, History, Pencil, Sparkles, Wrench, Bug, AlertCircle, Palette, ExternalLink, CalendarClock, CheckCircle2, Circle, Link2, MessageSquare, Check, CheckSquare, MessageCircleQuestion, MoreVertical } from "lucide-react";
import { createMeetingNote, updateMeetingNote, deleteMeetingNote, toggleDeadlineComplete, updateRoadmapStatus, getMeetingNote } from "@/actions/meeting-note";
import { getNoteCommentThreads } from "@/actions/note-comment";
import { testDeadlineReminder } from "@/actions/deadline-reminder";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { NoteAnnotatedContent } from "@/components/project/note-annotated-content-lazy";
import { type NoteCommentThreadView } from "@/components/project/note-comment-panel";
import { AttachToTaskDialog } from "@/components/project/attach-to-task-dialog";
import { CreateTaskFromNoteDialog } from "@/components/project/create-task-from-note";
import { PageHeaderActions } from "@/components/page-header-actions";
import { AddButton } from "@/components/add-button";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { taskCode } from "@/lib/task-label";
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
import { NoteHistoryDialog } from "@/components/project/note-history-dialog";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { LinkedCountPopover } from "@/components/project/linked-count-popover";
import { RoadmapBoard } from "@/components/project/roadmap-board";
import { RoadmapWarningDialog } from "@/components/project/roadmap-commit-dialog";
import { normalizeRoadmapStatus, roadmapAllowsCreateTask, roadmapScheduleError, type RoadmapStatus } from "@/lib/roadmap-status";
import { addWorkingDays, formatWorkingDays, parseWorkingDays, startOfLocalDay, toDateInputValue } from "@/lib/working-days";
import { cn } from "@/lib/utils";

type NoteType = "MEETING_NOTE" | "DECISION" | "CLARIFICATION" | "DEADLINE" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";

const NOTE_TYPE_CONFIG: Record<NoteType, { label: string; color: string; bgColor: string; icon: typeof FileText }> = {
  MEETING_NOTE: { label: "Meeting Note", color: "text-primary", bgColor: "bg-primary/10 border-primary/20", icon: FileText },
  DECISION: { label: "Decision", color: "text-orange", bgColor: "bg-orange/10 border-orange/20", icon: Gavel },
  CLARIFICATION: { label: "Clarification", color: "text-sky-400", bgColor: "bg-sky-500/10 border-sky-500/20", icon: MessageCircleQuestion },
  DEADLINE: { label: "Roadmap", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20", icon: CalendarClock },
  FEATURE: { label: "Business Case", color: "text-primary", bgColor: "bg-primary/10 border-primary/20", icon: Sparkles },
  ENHANCEMENT: { label: "Enhancement", color: "text-violet-400", bgColor: "bg-violet-500/10 border-violet-500/20", icon: Wrench },
  BUG: { label: "Bug", color: "text-orange", bgColor: "bg-orange/10 border-orange/20", icon: Bug },
  REPORTED_BUG: { label: "Reported Bug", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20", icon: AlertCircle },
  DESIGN: { label: "Design", color: "text-cyan-400", bgColor: "bg-cyan-500/10 border-cyan-500/20", icon: Palette },
};

function getDeadlineStatus(dueDate: Date | string, completedAt: Date | string | null) {
  if (completedAt) return { label: "Completed", color: "text-success", bg: "bg-success/10 border-success/20" };
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20" };
  if (days === 0) return { label: "Due today", color: "text-orange", bg: "bg-orange/10 border-orange/20" };
  if (days === 1) return { label: "Due tomorrow", color: "text-orange", bg: "bg-orange/10 border-orange/20" };
  if (days <= 7) return { label: `${days}d left`, color: "text-orange", bg: "bg-orange/10 border-orange/20" };
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

interface LinkedTask {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  projectId?: string;
  stage?: string;
}

export interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: Date;
  noteType: string;
  dueDate?: Date | string | null;
  startedAt?: Date | string | null;
  workingDays?: number | null;
  completedAt?: Date | string | null;
  roadmapStatus?: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; imageUrl: string | null };
  task: LinkedTask | null;
  taskLinks?: {
    id?: string;
    quoteText?: string | null;
    createdAt?: Date | string;
    createdBy?: { id: string; name: string | null; imageUrl: string | null };
    task: LinkedTask;
  }[];
  commentThreads?: {
    id: string;
    quoteText: string;
    conversationId: string | null;
    _count: { comments: number };
    subscribers?: { userId: string; understoodAt: Date | string | null }[];
  }[];
  history?: NoteHistoryEntry[];
  reminderLogs?: ReminderLogEntry[];
}

function allLinkedTasks(note: MeetingNote): LinkedTask[] {
  const map = new Map<string, LinkedTask>();
  if (note.task) map.set(note.task.id, note.task);
  for (const link of note.taskLinks ?? []) map.set(link.task.id, link.task);
  return [...map.values()];
}

function NoteCardStatusIcon({
  openCount,
  doneCount,
  icon: Glyph,
  openLabel,
  doneLabel,
  iconClass,
  badgeClass,
}: {
  openCount: number;
  doneCount: number;
  icon: typeof CheckSquare;
  openLabel: string;
  doneLabel: string;
  iconClass: string;
  badgeClass: string;
}) {
  if (openCount <= 0 && doneCount <= 0) return null;
  return (
    <>
      {openCount > 0 && (
        <span
          className={cn(
            "relative grid size-7 place-items-center rounded-full border border-border bg-popover",
            iconClass,
          )}
          title={openLabel}
        >
          <Glyph className="h-3.5 w-3.5" />
          <span
            className={cn(
              "absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-xs font-bold leading-4 text-background",
              badgeClass,
            )}
          >
            {openCount}
          </span>
        </span>
      )}
      {doneCount > 0 && (
        <span
          className="relative grid size-7 place-items-center rounded-full border border-border bg-popover text-muted-foreground/50"
          title={doneLabel}
        >
          <Glyph className="h-3.5 w-3.5" />
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-muted px-1 text-xs font-bold leading-4 text-muted-foreground">
            {doneCount}
          </span>
        </span>
      )}
    </>
  );
}

function noteBodyPreview(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface Props {
  notes: MeetingNote[];
  projectId: string;
  canEdit: boolean;
  currentUserId?: string;
  isSystemAdmin?: boolean;
  isDeadlineTestProject?: boolean;
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
  isActive?: boolean;
  section?: "notes" | "roadmap";
  onFullscreenChange?: (open: boolean, goBack?: () => void) => void;
  onNotesChange?: (updater: (prev: MeetingNote[]) => MeetingNote[]) => void;
}

const ALL_NOTE_TYPES: NoteType[] = ["MEETING_NOTE", "DECISION", "CLARIFICATION", "DEADLINE", "FEATURE", "ENHANCEMENT", "BUG", "REPORTED_BUG", "DESIGN"];
const NOTES_CREATE_TYPES: NoteType[] = ["MEETING_NOTE", "DECISION", "CLARIFICATION"];
const ROADMAP_CREATE_TYPES: NoteType[] = ["DEADLINE"];

export function MeetingNotesTab({
  notes: allNotes,
  projectId,
  canEdit,
  currentUserId,
  isSystemAdmin = false,
  isDeadlineTestProject = false,
  allowedTaskTypes = [],
  activeContractType = null,
  isActive = true,
  section = "notes",
  onFullscreenChange,
  onNotesChange,
}: Props) {
  const isRoadmap = section === "roadmap";
  const tabKey = isRoadmap ? "roadmap" : "notes";
  const createTypes = isRoadmap ? ROADMAP_CREATE_TYPES : NOTES_CREATE_TYPES;
  const notes = useMemo(
    () =>
      allNotes.filter((n) =>
        isRoadmap ? n.noteType === "DEADLINE" : n.noteType !== "DEADLINE",
      ),
    [allNotes, isRoadmap],
  );
  const [filter, setFilter] = useState<NoteType | "ALL">("ALL");
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const dismissedNoteIdRef = useRef<string | null>(null);

  const setNotes = useCallback(
    (updater: (prev: MeetingNote[]) => MeetingNote[]) => {
      onNotesChange?.(updater);
    },
    [onNotesChange],
  );

  const goBack = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    dismissedNoteIdRef.current = params.get("noteId");
    setView("list");
    setSelectedNote(null);
    params.delete("noteId");
    params.delete("threadId");
    params.set("tab", tabKey);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [tabKey]);

  useEffect(() => {
    onFullscreenChange?.(view !== "list", view !== "list" ? goBack : undefined);
  }, [view, goBack, onFullscreenChange]);

  useEffect(() => {
    return () => onFullscreenChange?.(false);
  }, [onFullscreenChange]);

  useEffect(() => {
    const noteId = searchParams.get("noteId");
    if (!noteId || noteId === dismissedNoteIdRef.current) return;
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
  }, [setNotes]);

  const toggleComplete = useCallback(async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (note && !note.completedAt) {
      const blocked = roadmapScheduleError("SHIPPED", note.dueDate, note.workingDays);
      if (blocked) {
        setScheduleError(blocked);
        return;
      }
    }
    setScheduleError(null);
    const { completedAt, roadmapStatus } = await toggleDeadlineComplete(noteId);
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, completedAt, roadmapStatus } : n)),
    );
    setSelectedNote((prev) =>
      prev?.id === noteId ? { ...prev, completedAt, roadmapStatus } : prev,
    );
  }, [setNotes, notes]);

  const moveStatus = useCallback(async (noteId: string, status: RoadmapStatus) => {
    const note =
      notes.find((n) => n.id === noteId) ??
      (selectedNote?.id === noteId ? selectedNote : null);
    const blocked = roadmapScheduleError(status, note?.dueDate, note?.workingDays);
    if (blocked) {
      setScheduleError(blocked);
      return;
    }
    setScheduleError(null);
    const prevStatus = note?.roadmapStatus;
    const prevCompleted = note?.completedAt ?? null;
    const prevDue = note?.dueDate ?? null;
    const prevStarted = note?.startedAt ?? null;
    const completedAt = status === "SHIPPED" ? new Date() : null;
    const optimisticStart =
      status === "PROGRESS" ? startOfLocalDay() : undefined;
    const optimisticDue =
      status === "PROGRESS" && note?.workingDays != null
        ? addWorkingDays(optimisticStart ?? startOfLocalDay(), note.workingDays)
        : undefined;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? {
              ...n,
              roadmapStatus: status,
              completedAt: status === "SHIPPED" ? n.completedAt ?? completedAt : null,
              ...(optimisticDue ? { dueDate: optimisticDue } : {}),
              ...(optimisticStart ? { startedAt: optimisticStart } : {}),
            }
          : n,
      ),
    );
    setSelectedNote((prev) =>
      prev?.id === noteId
        ? {
            ...prev,
            roadmapStatus: status,
            completedAt: status === "SHIPPED" ? prev.completedAt ?? completedAt : null,
            ...(optimisticDue ? { dueDate: optimisticDue } : {}),
            ...(optimisticStart ? { startedAt: optimisticStart } : {}),
          }
        : prev,
    );
    try {
      const result = await updateRoadmapStatus(noteId, status);
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, ...result } : n)),
      );
      setSelectedNote((prev) =>
        prev?.id === noteId ? { ...prev, ...result } : prev,
      );
    } catch (err) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? { ...n, roadmapStatus: prevStatus, completedAt: prevCompleted, dueDate: prevDue, startedAt: prevStarted }
            : n,
        ),
      );
      setSelectedNote((prev) =>
        prev?.id === noteId
          ? { ...prev, roadmapStatus: prevStatus, completedAt: prevCompleted, dueDate: prevDue, startedAt: prevStarted }
          : prev,
      );
      setScheduleError(err instanceof Error ? err.message : "Could not update status");
    }
  }, [setNotes, notes, selectedNote]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return notes;
    return notes.filter((n) => n.noteType === filter);
  }, [notes, filter]);

  const usedTypes = useMemo(() => {
    const types = new Set(notes.map((n) => n.noteType));
    return ALL_NOTE_TYPES.filter((t) => types.has(t));
  }, [notes]);

  function openNote(note: MeetingNote) {
    dismissedNoteIdRef.current = null;
    setSelectedNote(note);
    setView("detail");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tabKey);
    params.set("noteId", note.id);
    params.delete("threadId");
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  function openCreate(_status: RoadmapStatus = "PLANNED") {
    setView("create");
  }

  if (view === "create") {
    return (
      <NoteFullScreenCreate
        projectId={projectId}
        createTypes={createTypes}
        onCreated={(note) => {
          setNotes((prev) => [note, ...prev]);
          goBack();
        }}
      />
    );
  }

  if (view === "detail" && selectedNote) {
    return (
      <NoteFullScreenDetail
        note={selectedNote}
        projectId={projectId}
        canEdit={canEdit}
        isSystemAdmin={isSystemAdmin}
        isDeadlineTestProject={isDeadlineTestProject}
        allowedTaskTypes={allowedTaskTypes}
        activeContractType={activeContractType}
        isActive={isActive}
        initialThreadId={searchParams.get("threadId")}
        currentUserId={currentUserId}
        onToggleComplete={() => toggleComplete(selectedNote.id)}
        scheduleError={scheduleError}
        onRefresh={() => refreshNote(selectedNote.id)}
        onDelete={async () => {
          await deleteMeetingNote(selectedNote.id);
          setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id));
          goBack();
        }}
      />
    );
  }

  return (
    <div>
      {isRoadmap ? (
        <>
        <RoadmapBoard
          notes={notes}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onOpen={(id) => {
            const note = notes.find((n) => n.id === id);
            if (note) openNote(note);
          }}
          onCreate={openCreate}
          onMove={moveStatus}
          onBlocked={setScheduleError}
          onToggleComplete={(id) => void toggleComplete(id)}
        />
        {scheduleError ? (
          <RoadmapWarningDialog
            heading="Cannot move item"
            message={scheduleError}
            onDismiss={() => setScheduleError(null)}
          />
        ) : null}
        </>
      ) : (
      <>
      {(usedTypes.length > 1 || canEdit) && (
      <div className="mb-4 flex items-center gap-2">
        {usedTypes.length > 1 && (
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg bg-muted/50 p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["ALL" as const, ...usedTypes]).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={cn(
                  "shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  filter === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "ALL" ? "All" : NOTE_TYPE_CONFIG[t].label}
                <span className="ms-1 text-xs opacity-60">
                  {t === "ALL" ? notes.length : notes.filter((n) => n.noteType === t).length}
                </span>
              </button>
            ))}
        </div>
        )}
        {canEdit && (
          <AddButton
            className="ms-auto"
            label={isRoadmap ? "New roadmap item" : "New note"}
            onClick={() => openCreate()}
          />
        )}
      </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          {isRoadmap ? (
            <CalendarClock className="h-10 w-10 mb-2 opacity-40" />
          ) : (
            <FileText className="h-10 w-10 mb-2 opacity-40" />
          )}
          <p className="text-s">
            {filter === "ALL" ? (isRoadmap ? "Nothing on the roadmap yet" : "No notes yet") : `No ${NOTE_TYPE_CONFIG[filter].label.toLowerCase()}s yet`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-s sm:[grid-template-columns:repeat(auto-fill,minmax(15.75rem,1fr))]">
          {filtered.map((note) => {
            const cfg = NOTE_TYPE_CONFIG[(note.noteType as NoteType)] ?? NOTE_TYPE_CONFIG.MEETING_NOTE;
            const Icon = cfg?.icon ?? FileText;
            const isDeadline = note.noteType === "DEADLINE";
            const deadlineStatus =
              isDeadline && note.dueDate
                ? getDeadlineStatus(note.dueDate, note.completedAt ?? null)
                : null;
            const linked = allLinkedTasks(note);
            const tasksDoneCount = linked.filter((t) => t.stage === "DONE").length;
            const tasksOpenCount = linked.length - tasksDoneCount;
            const commentThreads = note.commentThreads ?? [];
            const commentsDoneCount = commentThreads.filter((t) =>
              currentUserId
                ? t.subscribers?.some((s) => s.userId === currentUserId && s.understoodAt)
                : false,
            ).length;
            const commentsOpenCount = commentThreads.length - commentsDoneCount;
            const authorInitial = (note.author.name ?? "?").charAt(0).toUpperCase();
            const bodyPreview = noteBodyPreview(note.content);

            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => openNote(note)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openNote(note);
                  }
                }}
                className={cn(
                  "flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-3 text-start transition-colors hover:border-border",
                  note.completedAt && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  {cfg && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-semibold ${cfg.bgColor} ${cfg.color}`}>
                      <Icon className="h-2.5 w-2.5" />
                      {cfg.label}
                    </span>
                  )}
                  {isDeadline && canEdit && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await toggleComplete(note.id);
                      }}
                      className="shrink-0"
                      title={note.completedAt ? "Mark incomplete" : "Mark complete"}
                    >
                      {note.completedAt ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/40 hover:text-primary transition-colors" />
                      )}
                    </button>
                  )}
                </div>

                <h3 className={cn("mt-2.5 text-s font-bold leading-snug line-clamp-4", note.completedAt && "line-through")}>
                  {note.title}
                </h3>

                {(deadlineStatus || note.workingDays != null) && (
                  <span className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${deadlineStatus?.bg ?? "bg-muted border-border"} ${deadlineStatus?.color ?? "text-muted-foreground"}`}>
                    {[
                      deadlineStatus?.label,
                      note.dueDate ? format(new Date(note.dueDate), "MMM d, yyyy") : null,
                      note.startedAt ? `Started ${format(new Date(note.startedAt), "MMM d")}` : null,
                      note.workingDays != null ? formatWorkingDays(note.workingDays) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}

                {bodyPreview ? (
                  <div className="relative mt-2 min-h-0 flex-1 overflow-hidden">
                    <p className="text-s leading-relaxed text-muted-foreground">
                      {bodyPreview}
                    </p>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
                  </div>
                ) : (
                  <div className="min-h-0 flex-1" />
                )}

                <div className="mt-auto shrink-0 pt-3">
                  <p className="text-xs text-muted-foreground">
                    Created {format(new Date(note.createdAt), "MMM d, yyyy")}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-s">
                    <NoteCardStatusIcon
                      openCount={tasksOpenCount}
                      doneCount={tasksDoneCount}
                      icon={CheckSquare}
                      openLabel={`${tasksOpenCount} open ${tasksOpenCount === 1 ? "task" : "tasks"}`}
                      doneLabel={`${tasksDoneCount} ${tasksDoneCount === 1 ? "task" : "tasks"} done`}
                      iconClass="text-success"
                      badgeClass="bg-success"
                    />
                    <NoteCardStatusIcon
                      openCount={commentsOpenCount}
                      doneCount={commentsDoneCount}
                      icon={MessageSquare}
                      openLabel={`${commentsOpenCount} open ${commentsOpenCount === 1 ? "comment" : "comments"}`}
                      doneLabel={`${commentsDoneCount} ${commentsDoneCount === 1 ? "comment" : "comments"} understood`}
                      iconClass="text-orange"
                      badgeClass="bg-orange"
                    />
                    <Avatar
                      size="sm"
                      className="ms-auto"
                      title={note.author.name ?? "Unknown"}
                    >
                      <AvatarImage src={note.author.imageUrl ?? undefined} alt="" />
                      <AvatarFallback>{authorInitial}</AvatarFallback>
                    </Avatar>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ─── Full-screen create ─── */

function NoteFullScreenCreate({
  projectId,
  onCreated,
  createTypes,
}: {
  projectId: string;
  onCreated: (note: MeetingNote) => void;
  createTypes: NoteType[];
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [noteType, setNoteType] = useState<NoteType | null>(createTypes.length === 1 ? createTypes[0] : null);
  const [saving, setSaving] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isDeadline = noteType === "DEADLINE";

  async function handleSave() {
    if (!noteType) { setTypeError(true); return; }
    if (!title.trim()) return;
    setTypeError(false);
    setSaveError(null);
    setSaving(true);
    try {
      const created = await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date,
        noteType,
        ...(isDeadline ? { roadmapStatus: "PLANNED" } : {}),
      });
      const full = await getMeetingNote(created.id);
      onCreated(full as unknown as MeetingNote);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const placeholders: Record<string, string> = {
    DECISION: "What was decided?",
    CLARIFICATION: "What needs clarifying?",
    DEADLINE: "Title...",
    MEETING_NOTE: "Meeting title...",
  };

  const editorPlaceholders: Record<string, string> = {
    DECISION: "Describe the context, options considered, and rationale... (type / for commands)",
    CLARIFICATION: "Capture the questions, missing details, and what was clarified... (type / for commands)",
    DEADLINE: "Notes about this item... (type / for commands)",
    MEETING_NOTE: "Write your meeting notes here... (type / for commands)",
  };

  return (
    <div className="flex flex-col bg-background">
      <PageHeaderActions>
        <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </PageHeaderActions>

      <div className="max-w-4xl mx-auto w-full px-app py-6 sm:py-10 lg:px-16">
          {/* Type picker */}
          {createTypes.length > 1 && (
          <div className="mb-6">
            <div className="flex gap-2 flex-wrap">
              {createTypes.map((id) => {
                const cfg = NOTE_TYPE_CONFIG[id];
                const Icon = cfg.icon;
                const isActive = noteType === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setNoteType(id); setTypeError(false); }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 text-s font-medium transition-colors",
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
            {typeError && <p className="text-xs text-destructive mt-1.5">Please select a type</p>}
          </div>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={placeholders[noteType ?? "MEETING_NOTE"] ?? "Title..."}
            className="w-full text-m font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-4"
            autoFocus
          />

          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border/50">
            {isDeadline ? (
              saveError ? (
                <p className="text-xs text-destructive">{saveError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  New items start in Planned. Drag on the board to change status.
                </p>
              )
            ) : (
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-auto text-s h-8"
              />
            )}
          </div>

          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder={editorPlaceholders[noteType ?? "MEETING_NOTE"] ?? "Write here... (type / for commands)"}
            borderless
            projectId={projectId}
          />
      </div>
    </div>
  );
}

/* ─── Full-screen detail ─── */

export function NoteFullScreenDetail({
  note,
  projectId,
  canEdit,
  isSystemAdmin,
  isDeadlineTestProject,
  allowedTaskTypes,
  activeContractType,
  isActive,
  initialThreadId,
  currentUserId,
  onToggleComplete,
  onRefresh,
  onDelete,
  scheduleError,
  onClose,
}: {
  note: MeetingNote;
  projectId: string;
  canEdit: boolean;
  isSystemAdmin?: boolean;
  isDeadlineTestProject?: boolean;
  allowedTaskTypes: string[];
  activeContractType: string | null;
  isActive: boolean;
  initialThreadId: string | null;
  currentUserId?: string;
  onToggleComplete: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onDelete: () => Promise<void>;
  scheduleError?: string | null;
  /** When set, this is a slide-over covering the current page (chat). */
  onClose?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [dueDate, setDueDate] = useState(
    note.dueDate ? toDateInputValue(note.dueDate) : "",
  );
  const [startedAt, setStartedAt] = useState(
    note.startedAt ? toDateInputValue(note.startedAt) : "",
  );
  const [workingDays, setWorkingDays] = useState(
    note.workingDays != null ? String(note.workingDays) : "",
  );
  const [workingDaysError, setWorkingDaysError] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | string | null>(
    note.completedAt ?? null,
  );
  const [togglingComplete, setTogglingComplete] = useState(false);
  const [testingMilestone, setTestingMilestone] = useState<number | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [createQuote, setCreateQuote] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [threads, setThreads] = useState<NoteCommentThreadView[]>([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const linked = allLinkedTasks(note);
  const tasksDoneCount = linked.filter((t) => t.stage === "DONE").length;

  const loadThreads = useCallback(async () => {
    const data = await getNoteCommentThreads(note.id);
    setThreads(
      data.map((t) => ({
        id: t.id,
        quoteText: t.quoteText,
        conversationId: t.conversationId,
        comments: t.comments,
        understood: currentUserId
          ? t.subscribers.some((s) => s.userId === currentUserId && s.understoodAt)
          : false,
      })),
    );
  }, [note.id, currentUserId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const timeline = useMemo(
    () =>
      buildNoteTimeline({
        id: note.id,
        noteType: note.noteType,
        createdAt: note.createdAt,
        author: note.author,
        history: note.history,
        reminderLogs: note.reminderLogs,
        comments: threads.flatMap((thread) =>
          thread.comments.map((comment, i) => ({
            id: comment.id,
            content: comment.content,
            quoteText: thread.quoteText,
            createdAt: comment.createdAt,
            user: comment.user,
            isReply: i > 0,
          })),
        ),
        tasks: (note.taskLinks ?? []).map((link, i) => ({
          id: link.id ?? `${link.task.id}-${i}`,
          quoteText: link.quoteText ?? null,
          createdAt: link.createdAt ?? note.createdAt,
          user: link.createdBy ?? note.author,
          taskTitle: link.task.title,
          taskCode: taskCode(link.task.taskType, link.task.taskNumber),
        })),
      }),
    [note, threads],
  );

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setCompletedAt(note.completedAt ?? null);
    setDueDate(note.dueDate ? toDateInputValue(note.dueDate) : "");
    setStartedAt(note.startedAt ? toDateInputValue(note.startedAt) : "");
    setWorkingDays(note.workingDays != null ? String(note.workingDays) : "");
  }, [note]);

  const config = NOTE_TYPE_CONFIG[(note.noteType as NoteType)] ?? NOTE_TYPE_CONFIG.MEETING_NOTE;
  const Icon = config?.icon ?? FileText;
  const isDeadline = note.noteType === "DEADLINE";
  const currentRoadmapStatus = normalizeRoadmapStatus(note.roadmapStatus, completedAt);
  const canCreateTaskFromNote =
    isActive &&
    allowedTaskTypes.length > 0 &&
    (!isDeadline || roadmapAllowsCreateTask(currentRoadmapStatus));
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
    setWorkingDaysError(null);
    try {
      let days: number | null | undefined;
      if (isDeadline && currentRoadmapStatus === "NEXT") {
        try {
          days = parseWorkingDays(workingDays);
        } catch (e) {
          setWorkingDaysError(e instanceof Error ? e.message : "Invalid efforts");
          setSaving(false);
          return;
        }
      }
      await updateMeetingNote({
        noteId: note.id,
        title: title.trim(),
        content,
        ...(isDeadline && currentRoadmapStatus === "NEXT"
          ? { workingDays: days ?? null }
          : {}),
        ...(isDeadline && (currentRoadmapStatus === "PROGRESS" || currentRoadmapStatus === "SHIPPED")
          ? { dueDate: dueDate || null, startedAt: startedAt || null }
          : {}),
      });
      await onRefresh();
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      setWorkingDaysError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function saveEfforts(raw = workingDays) {
    if (!canEdit || currentRoadmapStatus !== "NEXT") return;
    try {
      const days = parseWorkingDays(raw);
      if (days === (note.workingDays ?? null)) return;
      setWorkingDaysError(null);
      await updateMeetingNote({ noteId: note.id, workingDays: days });
      await onRefresh();
    } catch (e) {
      setWorkingDaysError(e instanceof Error ? e.message : "Invalid efforts");
    }
  }

  async function saveDueDate() {
    if (!canEdit) return;
    if (currentRoadmapStatus !== "PROGRESS" && currentRoadmapStatus !== "SHIPPED") return;
    if (!dueDate) {
      setWorkingDaysError("Due date is required");
      return;
    }
    setWorkingDaysError(null);
    try {
      await updateMeetingNote({ noteId: note.id, dueDate });
      await onRefresh();
    } catch (e) {
      setWorkingDaysError(e instanceof Error ? e.message : "Could not save due date");
    }
  }

  async function saveStartedAt() {
    if (!canEdit) return;
    if (currentRoadmapStatus !== "PROGRESS" && currentRoadmapStatus !== "SHIPPED") return;
    if (!startedAt) {
      setWorkingDaysError("Starting date is required");
      return;
    }
    setWorkingDaysError(null);
    try {
      await updateMeetingNote({ noteId: note.id, startedAt });
      await onRefresh();
    } catch (e) {
      setWorkingDaysError(e instanceof Error ? e.message : "Could not save starting date");
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

  const overlay = Boolean(onClose);

  useEffect(() => {
    if (!overlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showHistory || attachOpen || createQuote !== null) return;
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [overlay, onClose, showHistory, attachOpen, createQuote]);

  function cancelEditing() {
    setIsEditing(false);
    setTitle(note.title);
    setContent(note.content);
    setDueDate(note.dueDate ? toDateInputValue(note.dueDate) : "");
    setStartedAt(note.startedAt ? toDateInputValue(note.startedAt) : "");
    setWorkingDays(note.workingDays != null ? String(note.workingDays) : "");
    setWorkingDaysError(null);
  }

  const overflowItems = (
    <>
              <DropdownMenuItem onClick={() => setShowHistory(true)}>
                <History className="h-4 w-4" />
                <span className="flex-1">History</span>
              </DropdownMenuItem>
              {canEdit && (
                <>
                  {isDeadline && (
                    <DropdownMenuItem
                      onClick={handleToggleComplete}
                      disabled={togglingComplete}
                      className={cn(completedAt && "text-success focus:text-success")}
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
                  <DropdownMenuItem onClick={() => setAttachOpen(true)}>
                    <Link2 className="h-4 w-4" />
                    <span className="flex-1">Attach to task</span>
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
                            <DropdownMenuLabel className="text-xs text-muted-foreground">
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
                </>
              )}
    </>
  );

  const editActions = (
    <>
      <Button variant="ghost" size="sm" onClick={cancelEditing}>Cancel</Button>
      <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </>
  );

  const body = (
      <div className="max-w-4xl mx-auto w-full px-app py-6 sm:py-10 lg:px-16">
            {/* Type badge + meta */}
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {config && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.bgColor} ${config.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </span>
              )}
              {deadlineStatus && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${deadlineStatus.bg} ${deadlineStatus.color}`}>
                  {deadlineStatus.label}
                </span>
              )}
              {isDeadline && currentRoadmapStatus === "PLANNED" && (
                <span className="text-s text-muted-foreground">Planned</span>
              )}
              {!isDeadline && (
              <span className="text-s text-muted-foreground">
                {format(new Date(note.date), "MMMM d, yyyy")}
              </span>
              )}
            </div>

            {isDeadline && canEdit && currentRoadmapStatus === "NEXT" && (
              <div className="mb-6">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Efforts ( Working days )</label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 5"
                  value={workingDays}
                  onChange={(e) => {
                    const next = e.target.value;
                    setWorkingDays(next);
                    setWorkingDaysError(null);
                    void saveEfforts(next);
                  }}
                  onBlur={() => void saveEfforts()}
                  className="w-28 text-s h-8"
                />
                {workingDaysError ? (
                  <p className="text-xs text-destructive mt-0.5">{workingDaysError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">Required before In Progress</p>
                )}
              </div>
            )}
            {isDeadline && (currentRoadmapStatus === "PROGRESS" || currentRoadmapStatus === "SHIPPED") && (
              <div className="mb-6 flex flex-wrap gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Starting Date</label>
                  <Input
                    type="date"
                    value={startedAt}
                    onChange={(e) => {
                      setStartedAt(e.target.value);
                      setWorkingDaysError(null);
                    }}
                    onBlur={() => {
                      if (canEdit) void saveStartedAt();
                    }}
                    disabled={!canEdit}
                    className="w-auto text-s h-8"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Set when this moved to In Progress. You can adjust it.
                  </p>
                </div>
                <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setWorkingDaysError(null);
                  }}
                  onBlur={() => {
                    if (canEdit) void saveDueDate();
                  }}
                  disabled={!canEdit}
                  className="w-auto text-s h-8"
                />
                {workingDaysError ? (
                  <p className="text-xs text-destructive mt-0.5">{workingDaysError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Calculated from Efforts. You can adjust it.
                  </p>
                )}
                </div>
              </div>
            )}
            {isDeadline && canEdit && testMessage && (
              <p className="mb-4 text-xs text-muted-foreground">{testMessage}</p>
            )}

            {/* Created by + timestamps + linked task */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-6 text-s text-muted-foreground/70">
              <span
                className="inline-flex items-center gap-xs"
                title={note.author.name ?? "Unknown"}
              >
                <Avatar size="sm">
                  <AvatarImage src={note.author.imageUrl ?? undefined} alt="" />
                  <AvatarFallback>
                    {(note.author.name ?? "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
              {linked.length > 0 && (
                <>
                  <span>·</span>
                  <LinkedCountPopover
                    count={linked.length}
                    completed={tasksDoneCount}
                    singular="Task"
                    plural="Tasks"
                    icon={CheckSquare}
                    open={tasksOpen}
                    onOpenChange={setTasksOpen}
                    className={
                      tasksDoneCount === linked.length
                        ? "text-muted-foreground hover:text-muted-foreground/80"
                        : undefined
                    }
                  >
                    {linked.map((t) => {
                      const done = t.stage === "DONE";
                      return (
                        <a
                          key={t.id}
                          href={`/dashboard/projects/${projectId}/tasks/${t.id}?from=note&noteId=${note.id}`}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 text-s transition-colors",
                            done
                              ? "border-border/40 text-muted-foreground opacity-60"
                              : "border-border/50 hover:border-border",
                          )}
                        >
                          <CheckSquare
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              done ? "text-muted-foreground/50" : "text-success",
                            )}
                          />
                          <span
                            className={cn(
                              "font-mono text-xs font-semibold",
                              done ? "text-muted-foreground" : "text-primary",
                            )}
                          >
                            {taskCode(t.taskType, t.taskNumber)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{t.title}</span>
                          {done ? (
                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </a>
                      );
                    })}
                  </LinkedCountPopover>
                </>
              )}
              {threads.length > 0 && (
                <>
                  <span>·</span>
                  <LinkedCountPopover
                    count={threads.length}
                    singular="Comment"
                    plural="Comments"
                    icon={MessageSquare}
                    open={commentsOpen}
                    onOpenChange={setCommentsOpen}
                    className={
                      threads.every((t) => t.understood)
                        ? "text-muted-foreground hover:text-muted-foreground/80"
                        : undefined
                    }
                  >
                    {threads.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        data-note-comment-ui
                        onClick={() => {
                          setCommentsOpen(false);
                          setActiveThreadId(t.id);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start text-s transition-colors",
                          t.understood
                            ? "border-border/40 text-muted-foreground"
                            : "border-border/50 hover:border-border",
                        )}
                      >
                        <MessageSquare
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            t.understood ? "text-muted-foreground/50" : "text-orange",
                          )}
                        />
                        <span className={cn("min-w-0 flex-1 truncate italic", t.understood && "opacity-60")}>
                          {t.quoteText}
                        </span>
                        {t.understood ? (
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-orange px-1 text-xs font-bold leading-5 text-background">
                            {t.comments.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </LinkedCountPopover>
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
                className="w-full text-m font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-6 sm:mb-8"
                autoFocus
              />
            ) : (
              <h1 className={cn("text-m font-bold mb-6 sm:mb-8", completedAt && "line-through opacity-60")}>
                {note.title}
              </h1>
            )}

            {/* Content */}
            {isEditing ? (
              <RichTextEditor content={content} onChange={setContent} borderless projectId={projectId} />
            ) : (
              <NoteAnnotatedContent
                content={note.content}
                noteId={note.id}
                projectId={projectId}
                canCreateTask={canCreateTaskFromNote}
                threads={threads}
                openThreadId={activeThreadId}
                onOpenThread={setActiveThreadId}
                taskUrl={(taskId) =>
                  `/dashboard/projects/${projectId}/tasks/${taskId}?from=note&noteId=${note.id}`
                }
                linkedTasks={linked}
                onCreateTask={(quote) => setCreateQuote(quote)}
                onChanged={async () => {
                  await onRefresh();
                  await loadThreads();
                }}
              />
            )}
      </div>
  );

  const dialogs = (
    <>
      {showHistory && (
        <NoteHistoryDialog events={timeline} onClose={() => setShowHistory(false)} />
      )}

      <AttachToTaskDialog
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        noteId={note.id}
        projectId={projectId}
        excludeTaskIds={linked.map((t) => t.id)}
        onAttached={() => void onRefresh()}
      />

      <CreateTaskFromNoteDialog
        open={createQuote !== null}
        onClose={() => setCreateQuote(null)}
        noteId={note.id}
        projectId={projectId}
        quote={createQuote ?? ""}
        allowedTaskTypes={allowedTaskTypes}
        activeContractType={activeContractType}
        onCreated={() => void onRefresh()}
      />
    </>
  );

  if (onClose) {
    return (
      <NoteSlideOver
        title={note.title}
        onClose={onClose}
        headerRight={
          isEditing ? (
            <div className="flex shrink-0 items-center gap-1">{editActions}</div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Note actions"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {overflowItems}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
        {dialogs}
      </NoteSlideOver>
    );
  }

  return (
    <div className="flex flex-col bg-background">
      {!isEditing && (
        <PageOverflowItems id="note-detail" order={0}>
          {overflowItems}
        </PageOverflowItems>
      )}
      {isEditing && <PageHeaderActions>{editActions}</PageHeaderActions>}
      {body}
      {dialogs}
    </div>
  );
}
