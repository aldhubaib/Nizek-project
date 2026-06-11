"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, Loader2, MessageCircleQuestion, History, MessageSquare, ChevronRight, ChevronDown, Pencil, Check, Clock, Undo2, Gauge, Timer, FileText, Plus, Maximize2, Trash2, UserCircle2, Paperclip } from "lucide-react";
import { getTaskAnswers, saveTaskAnswers } from "@/actions/task-question";
import { updateTask, moveTask as moveTaskAction, declineTask, getTaskStageLogs, deleteTask, getEligibleAssignees } from "@/actions/task";
import { createMeetingNote, updateMeetingNote, getTaskNotes } from "@/actions/meeting-note";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { QuestionField, type TaskQuestion } from "./question-field";
import { ActivityTimeline } from "./activity-timeline";
import { CommentSection } from "./comment-section";
import { useKanbanStore, type KanbanTask, type Stage } from "@/store/kanban";
import { StageConfirmDialog, getCheckpoint } from "./stage-confirm-dialog";
import { cn } from "@/lib/utils";

const ACCURACY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  WAY_OVER:  { label: "Way Over",  color: "text-destructive",  bg: "bg-destructive/20 border-destructive/40" },
  OVER:      { label: "Over",      color: "text-orange-400",   bg: "bg-orange-500/20 border-orange-500/40" },
  ON_TRACK:  { label: "On Track",  color: "text-emerald-400",  bg: "bg-emerald-500/20 border-emerald-500/40" },
  UNDER:     { label: "Under",     color: "text-blue-400",     bg: "bg-blue-500/20 border-blue-500/40" },
  WAY_UNDER: { label: "Way Under", color: "text-violet-400",   bg: "bg-violet-500/20 border-violet-500/40" },
};

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

const TASK_TYPE_META: Record<string, { prefix: string; label: string; color: string }> = {
  FEATURE: { prefix: "F", label: "Business Case", color: "text-primary" },
  ENHANCEMENT: { prefix: "E", label: "Enhancement", color: "text-violet-400" },
  BUG: { prefix: "B", label: "Internal Bug", color: "text-amber-400" },
  REPORTED_BUG: { prefix: "RB", label: "Reported Bug", color: "text-destructive" },
  DESIGN: { prefix: "D", label: "Design", color: "text-cyan-400" },
};

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}

interface TaskAnswerWithQuestion {
  id: string;
  answer: string;
  questionId: string;
  question: TaskQuestion;
}

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "NEW_REQUEST", label: "New Request", color: "bg-zinc-500" },
  { id: "CLARIFICATION", label: "Clarification", color: "bg-violet-500" },
  { id: "READY_FOR_DEV", label: "Ready for Dev", color: "bg-blue-500" },
  { id: "IN_DEVELOPMENT", label: "In Development", color: "bg-sky-500" },
  { id: "INTERNAL_REVIEW", label: "Internal Review", color: "bg-amber-500" },
  { id: "CLIENT_REVIEW", label: "Client Review", color: "bg-orange-500" },
  { id: "READY_FOR_RELEASE", label: "Ready for Release", color: "bg-teal-500" },
  { id: "DONE", label: "Done", color: "bg-emerald-500" },
];

function formatDuration(from: Date, to: Date): string {
  const ms = to.getTime() - from.getTime();
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

interface Props {
  task: KanbanTask;
  open: boolean;
  onClose: () => void;
  questions: QuestionWithType[];
  projectId: string;
  isAdmin?: boolean;
}

function AttachedNotesSection({
  task,
  projectId,
  onCreateNote,
}: {
  task: KanbanTask;
  projectId: string;
  onCreateNote: () => void;
}) {
  const [notes, setNotes] = useState<{ id: string; title: string; content: string; createdAt: Date; author: { name: string | null } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingNote, setViewingNote] = useState<typeof notes[number] | null>(null);

  useEffect(() => {
    getTaskNotes(task.id)
      .then((data) => { setNotes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [task.id]);

  return (
    <>
      <div className="mt-6 pt-6 border-t border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-[13px] font-semibold">Notes</h3>
            {notes.length > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                {notes.length}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={onCreateNote} className="h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" />
            New
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/60 py-2">No notes attached</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-[11px] font-medium text-muted-foreground px-3 py-1.5">Title</th>
                  <th className="text-[11px] font-medium text-muted-foreground px-3 py-1.5 w-24 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr
                    key={note.id}
                    onClick={() => setViewingNote(note)}
                    className="border-b border-border/30 last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2">
                      <p className="text-[12px] font-medium text-primary truncate max-w-[220px]">{note.title}</p>
                      <p className="text-[10px] text-muted-foreground">by {note.author.name ?? "Unknown"}</p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingNote && createPortal(
        <NoteFullScreenViewer
          note={viewingNote}
          task={task}
          taskTypeMeta={{ prefix: TASK_TYPE_META[task.taskType]?.prefix ?? "F", label: TASK_TYPE_META[task.taskType]?.label ?? "Task", color: TASK_TYPE_META[task.taskType]?.color ?? "text-primary" }}
          onClose={() => setViewingNote(null)}
          onUpdated={(updated) => {
            setNotes((prev) => prev.map((n) => n.id === updated.id ? { ...n, title: updated.title, content: updated.content } : n));
            setViewingNote((prev) => prev ? { ...prev, title: updated.title, content: updated.content } : null);
          }}
        />,
        document.body
      )}
    </>
  );
}

function NoteFullScreenViewer({
  note,
  task,
  taskTypeMeta,
  onClose,
  onUpdated,
}: {
  note: { id: string; title: string; content: string; createdAt: Date; author: { name: string | null } };
  task: KanbanTask;
  taskTypeMeta: { prefix: string; label: string; color: string };
  onClose: () => void;
  onUpdated: (updated: { id: string; title: string; content: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateMeetingNote({ noteId: note.id, title: editTitle.trim(), content: editContent });
      onUpdated({ id: note.id, title: editTitle.trim(), content: editContent });
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
            Close
          </button>
          <span className="text-[11px] text-muted-foreground/50">|</span>
          <span className={`text-[12px] font-medium ${taskTypeMeta.color}`}>
            {taskTypeMeta.prefix}-{String(task.taskNumber).padStart(3, "0")}
          </span>
          <span className="text-[12px] text-muted-foreground truncate max-w-[200px]">
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditTitle(note.title); setEditContent(note.content); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !editTitle.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="w-3 h-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 sm:px-16 py-10">
          {editing ? (
            <>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-4"
                autoFocus
              />
              <div className="text-[12px] text-muted-foreground mb-8">
                by {note.author.name ?? "Unknown"} · {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
              </div>
              <RichTextEditor
                content={editContent}
                onChange={setEditContent}
                placeholder="Write your note... (type / for commands)"
                borderless
              />
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold mb-4">{note.title}</h1>
              <div className="text-[12px] text-muted-foreground mb-8">
                by {note.author.name ?? "Unknown"} · {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
              </div>
              {note.content ? (
                <div
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: note.content }}
                />
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">No content</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function TaskSidebar({ task, open, onClose, questions: allQuestions, projectId, isAdmin }: Props) {
  const questions = allQuestions.filter((q) => q.taskType === task.taskType);
  const router = useRouter();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef<Record<string, string>>({});
  const priorityRef = useRef<number | null>(task.priority);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState<Record<string, "saving" | "saved">>({});
  const [activityKey, setActivityKey] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const [timeTrackingOpen, setTimeTrackingOpen] = useState(false);
  const [notePanelOpen, setNotePanelOpen] = useState(false);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [moveError, setMoveError] = useState<string[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineComment, setDeclineComment] = useState("");
  const [declineFiles, setDeclineFiles] = useState<File[]>([]);
  const declineFileRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAdminStages, setShowAdminStages] = useState(false);
  const adminStagesRef = useRef<HTMLDivElement>(null);

  const taskTypeMeta = TASK_TYPE_META[task.taskType] ?? TASK_TYPE_META.FEATURE;
  const [declining, setDeclining] = useState(false);
  const canDeleteTask = task.stage === "NEW_REQUEST" || task.stage === "CLARIFICATION";
  const [editingAnswers, setEditingAnswers] = useState<Record<string, boolean>>({});
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);
  const [priorityValue, setPriorityValue] = useState<number | null>(task.priority);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [titleValue, setTitleValue] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { updateTask: updateStoreTask } = useKanbanStore();
  const [stageLogs, setStageLogs] = useState<{ stage: string; enteredAt: string; exitedAt: string | null }[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  useEffect(() => {
    setTitleValue(task.title);
    setPriorityValue(task.priority);
    priorityRef.current = task.priority;
  }, [task.title, task.priority]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  function recalcReadiness(latestAnswers?: Record<string, string>, latestPriority?: number | null) {
    const a = latestAnswers ?? answersRef.current;
    const p = latestPriority !== undefined ? latestPriority : priorityRef.current;
    const requiredQs = questions.filter((q) => q.required);
    const allAnswered = requiredQs.every((q) => {
      if (q.type === "client") return true;
      const answer = a[q.id];
      return answer && answer.trim();
    });
    const isReady = allAnswered && p != null;
    updateStoreTask(task.id, { isReadyForTransition: isReady });
  }

  async function handleTitleSave() {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === task.title) {
      setTitleValue(task.title);
      return;
    }
    try {
      await updateTask({ taskId: task.id, title: trimmed });
      updateStoreTask(task.id, { title: trimmed });
      setActivityKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      setTitleValue(task.title);
    }
  }

  async function handlePrioritySave(newPriority: number | null) {
    const oldPriority = priorityValue;
    setPriorityValue(newPriority);
    priorityRef.current = newPriority;
    setEditingPriority(false);
    if (newPriority === task.priority) return;
    updateStoreTask(task.id, { priority: newPriority });
    recalcReadiness(undefined, newPriority);
    try {
      await updateTask({ taskId: task.id, priority: newPriority });
      setActivityKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      setPriorityValue(oldPriority);
      priorityRef.current = oldPriority;
      updateStoreTask(task.id, { priority: oldPriority });
      recalcReadiness(undefined, oldPriority);
    }
  }

  useEffect(() => {
    if (!showAdminStages) return;
    function handleClickOutside(e: MouseEvent) {
      if (adminStagesRef.current && !adminStagesRef.current.contains(e.target as Node)) {
        setShowAdminStages(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAdminStages]);

  async function handleAdminStageChange(targetStage: Stage) {
    setShowAdminStages(false);
    if (targetStage === task.stage) return;
    setMovingStage(true);
    setMoveError(null);
    try {
      await moveTaskAction({ taskId: task.id, stage: targetStage, order: task.order });
      updateStoreTask(task.id, { stage: targetStage });
      setActivityKey((k) => k + 1);
    } catch (err) {
      setMoveError([(err as Error).message || "Failed to move task"]);
    } finally {
      setMovingStage(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditingAnswers({});
    getTaskAnswers(task.id)
      .then((data: TaskAnswerWithQuestion[]) => {
        const map: Record<string, string> = {};
        data.forEach((a) => {
          map[a.questionId] = a.answer;
        });
        setAnswers(map);
        answersRef.current = map;
        recalcReadiness(map, priorityRef.current);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    getTaskStageLogs(task.id)
      .then((data) => {
        setStartedAt(data.startedAt ? new Date(data.startedAt).toISOString() : null);
        setStageLogs(data.logs.map((l) => ({
          stage: l.stage,
          enteredAt: new Date(l.enteredAt).toISOString(),
          exitedAt: l.exitedAt ? new Date(l.exitedAt).toISOString() : null,
        })));
      })
      .catch(console.error);
  }, [open, task.id]);

  function handleAnswerChange(questionId: string, value: string) {
    const updated = { ...answersRef.current, [questionId]: value };
    setAnswers(updated);
    answersRef.current = updated;
    setEditingAnswers((prev) => ({ ...prev, [questionId]: true }));
    recalcReadiness(updated);
    debouncedSaveAnswer(questionId, value);
  }

  function debouncedSaveAnswer(questionId: string, value: string) {
    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(async () => {
      setSavingAnswers((prev) => ({ ...prev, [questionId]: "saving" }));
      try {
        await saveTaskAnswers({
          taskId: task.id,
          answers: [{ questionId, answer: value }],
        });
        setSavingAnswers((prev) => ({ ...prev, [questionId]: "saved" }));
        setMoveError(null);
        setActivityKey((k) => k + 1);
        setTimeout(() => setSavingAnswers((prev) => {
          const next = { ...prev };
          delete next[questionId];
          return next;
        }), 1500);
      } catch (err) {
        console.error(err);
        setSavingAnswers((prev) => {
          const next = { ...prev };
          delete next[questionId];
          return next;
        });
      }
    }, 800);
  }

  const currentStageIndex = STAGES.findIndex((s) => s.id === task.stage);
  const nextStage = currentStageIndex < STAGES.length - 1 ? STAGES[currentStageIndex + 1] : null;
  const clarificationIndex = STAGES.findIndex((s) => s.id === "CLARIFICATION");
  const isPostClarification = currentStageIndex > clarificationIndex;

  function handleMoveToNext() {
    if (!nextStage || movingStage) return;
    const checkpoint = getCheckpoint(task.stage as Stage, nextStage.id);
    if (checkpoint) {
      setShowConfirm(true);
      return;
    }
    executeMove();
  }

  async function executeMove(estimatedMinutes?: number) {
    if (!nextStage) return;
    setMovingStage(true);
    setMoveError(null);
    setShowConfirm(false);
    try {
      await moveTaskAction({ taskId: task.id, stage: nextStage.id, order: task.order, estimatedMinutes });
      updateStoreTask(task.id, { stage: nextStage.id, ...(estimatedMinutes ? { estimatedMinutes } : {}) });
      setActivityKey((k) => k + 1);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.startsWith("REQUIRED_QUESTIONS:")) {
        try {
          const missing = JSON.parse(msg.replace("REQUIRED_QUESTIONS:", ""));
          setMoveError(missing);
          setQuestionsOpen(true);
        } catch {
          setMoveError(["Some required questions are unanswered"]);
        }
      } else if (msg.startsWith("PRIORITY_BLOCKED:")) {
        try {
          const blocking = JSON.parse(msg.replace("PRIORITY_BLOCKED:", ""));
          setMoveError(["Higher priority tasks must move first:", ...blocking]);
        } catch {
          setMoveError(["Higher priority tasks must be completed first"]);
        }
      } else if (msg === "ESTIMATE_REQUIRED") {
        setMoveError(["An estimated time is required"]);
      } else {
        setMoveError([msg || "Failed to move task. Please try again."]);
      }
    } finally {
      setMovingStage(false);
    }
  }

  const canDecline = task.stage === "INTERNAL_REVIEW" || task.stage === "CLIENT_REVIEW";
  const declineTargetStage = task.stage === "CLIENT_REVIEW" ? "INTERNAL_REVIEW" : "IN_DEVELOPMENT";
  const declineTargetLabel = task.stage === "CLIENT_REVIEW" ? "Internal Review" : "In Development";

  async function handleDecline() {
    if (!declineComment.trim() || declining) return;
    setDeclining(true);
    try {
      let attachments: { filename: string; url: string; fileSize: number; mimeType: string }[] | undefined;
      if (declineFiles.length > 0) {
        attachments = await Promise.all(
          declineFiles.map(async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: fd });
            if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
            const { url } = await res.json();
            return { filename: file.name, url, fileSize: file.size, mimeType: file.type };
          })
        );
      }
      await declineTask({ taskId: task.id, comment: declineComment.trim(), attachments });
      updateStoreTask(task.id, { stage: declineTargetStage as Stage });
      setActivityKey((k) => k + 1);
      setShowDecline(false);
      setDeclineComment("");
      setDeclineFiles([]);
    } catch (err) {
      console.error(err);
    } finally {
      setDeclining(false);
    }
  }

  async function handleDeleteTask() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      onClose();
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full z-50 w-full max-w-md bg-background border-l border-border shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-mono text-muted-foreground shrink-0">
              {TASK_TYPE_META[task.taskType]?.prefix ?? "F"}-{String(task.taskNumber).padStart(3, "0")}
            </span>
            <span className={cn(
              "text-[11px] font-semibold shrink-0",
              TASK_TYPE_META[task.taskType]?.color ?? "text-primary"
            )}>
              {TASK_TYPE_META[task.taskType]?.label ?? task.taskType}
            </span>
            {priorityValue != null ? (
              <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0">
                P{priorityValue}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/50 shrink-0">
                No priority
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setTimeTrackingOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Time Tracking"
            >
              <Clock className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActivityOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Activity"
            >
              <History className="w-4 h-4" />
            </button>
            {canDeleteTask && (
              <button
                onClick={handleDeleteTask}
                disabled={deleting}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                title="Delete task"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => router.push(`/dashboard/projects/${projectId}/tasks/${task.id}`)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Open full page"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-48px)] p-5">
          {/* Feature Name */}
          <div className="mb-5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              {TASK_TYPE_META[task.taskType]?.label ?? "Task"} Name
            </label>
            {editingTitle && !isPostClarification ? (
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitleValue(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="text-sm font-semibold bg-transparent border-b border-primary outline-none w-full"
              />
            ) : (
              <h2
                className={cn("text-sm font-semibold", !isPostClarification && "cursor-text hover:text-primary/80 transition-colors")}
                onClick={() => !isPostClarification && setEditingTitle(true)}
              >
                {task.title}
              </h2>
            )}
          </div>

          {task.description && (
            <div className="mb-5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Description
              </label>
              <p className="text-[13px] text-muted-foreground">
                {task.description}
              </p>
            </div>
          )}

          {/* Priority */}
          <div className="mb-5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Priority
            </label>
            {isPostClarification ? (
              priorityValue != null ? (
                <span className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-[12px] font-semibold",
                  priorityValue >= 9
                    ? "bg-destructive/20 border-destructive/40 text-destructive"
                    : priorityValue >= 7
                      ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                      : priorityValue >= 4
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "bg-muted border-border text-foreground"
                )}>
                  P{priorityValue}
                </span>
              ) : (
                <span className="text-[12px] text-muted-foreground/50">No priority</span>
              )
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePrioritySave(null)}
                  className={cn(
                    "h-7 rounded-md border px-2 text-[12px] font-medium transition-colors",
                    priorityValue == null
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  )}
                >
                  None
                </button>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handlePrioritySave(n)}
                    className={cn(
                      "h-7 w-7 rounded-md border text-[12px] font-medium transition-colors",
                      priorityValue === n
                        ? n >= 9
                          ? "bg-destructive/20 border-destructive/40 text-destructive"
                          : n >= 7
                            ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                            : n >= 4
                              ? "bg-primary/20 border-primary/40 text-primary"
                              : "bg-muted border-primary/40 text-foreground"
                        : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Change Status */}
          <div className="mb-5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Change Status
            </label>
            {isAdmin ? (
              <div className="relative" ref={adminStagesRef}>
                <button
                  onClick={() => setShowAdminStages((v) => !v)}
                  disabled={movingStage}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-primary/15 border-primary/20 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
                >
                  {movingStage ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <span className={cn("w-2 h-2 rounded-full", STAGES[currentStageIndex]?.color)} />
                      {STAGES[currentStageIndex]?.label}
                      <ChevronDown className={cn("w-3 h-3 ml-0.5 transition-transform", showAdminStages && "rotate-180")} />
                    </>
                  )}
                </button>
                {showAdminStages && (
                  <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-border bg-popover shadow-xl overflow-hidden z-50">
                    {STAGES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleAdminStageChange(s.id)}
                        className={cn(
                          "flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-accent/50 transition-colors text-left",
                          s.id === task.stage && "bg-primary/10 font-semibold"
                        )}
                      >
                        <span className={cn("w-2 h-2 rounded-full shrink-0", s.color)} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-primary/15 border-primary/20 text-primary">
                  <span className={cn("w-2 h-2 rounded-full", STAGES[currentStageIndex]?.color)} />
                  {STAGES[currentStageIndex]?.label}
                </span>
                {nextStage && (
                  <>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                    <button
                      onClick={handleMoveToNext}
                      disabled={movingStage}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
                    >
                      {movingStage ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <span className={cn("w-2 h-2 rounded-full", nextStage.color)} />
                          {nextStage.label}
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
            {canDecline && (
              <div className="mt-2">
                {!showDecline ? (
                  <button
                    onClick={() => setShowDecline(true)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-destructive/70 hover:text-destructive transition-colors"
                  >
                    <Undo2 className="w-3 h-3" />
                    Decline &amp; return to {declineTargetLabel}
                  </button>
                ) : (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
                    <p className="text-[11px] font-medium text-destructive">
                      Why is this being declined?
                    </p>
                    <textarea
                      value={declineComment}
                      onChange={(e) => setDeclineComment(e.target.value)}
                      placeholder="Explain what needs to be fixed..."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-destructive/50 resize-none"
                      rows={3}
                      autoFocus
                    />
                    {declineFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {declineFiles.map((f, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-foreground/70">
                            <FileText className="w-2.5 h-2.5" />
                            <span className="truncate max-w-[80px]">{f.name}</span>
                            <button onClick={() => setDeclineFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDecline}
                        disabled={!declineComment.trim() || declining}
                        className="h-7 text-[11px]"
                      >
                        {declining ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Undo2 className="w-3 h-3 mr-1" />
                        )}
                        Decline
                      </Button>
                      <button
                        onClick={() => declineFileRef.current?.click()}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                        title="Attach files"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                      <input
                        ref={declineFileRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) setDeclineFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowDecline(false); setDeclineComment(""); setDeclineFiles([]); }}
                        className="h-7 text-[11px]"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {moveError && (
              <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-[11px] font-medium text-destructive mb-1">
                  Answer these required questions first:
                </p>
                <ul className="space-y-0.5">
                  {moveError.map((q, i) => (
                    <li key={i} className="text-[11px] text-destructive/80">
                      • {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Time Tracking moved to modal via Clock icon button */}

          {/* Estimate section moved to Time Tracking modal */}

          <AssigneePicker task={task} projectId={projectId} />


          {/* Questions */}
          {questions.length > 0 && (
            <div>
              <button
                onClick={() => setQuestionsOpen((v) => !v)}
                className="flex items-center gap-2 w-full text-left mb-2"
              >
                <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <h3 className="text-[13px] font-semibold flex-1">Questions</h3>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", questionsOpen && "rotate-180")} />
              </button>

              {questionsOpen && (
                <>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-5 mt-3">
                      {questions.map((q, i) => {
                        const currentVal = answers[q.id] ?? "";
                        const hasAnswer = !!currentVal.trim();
                        const explicitlyEditing = editingAnswers[q.id] ?? false;
                        const isEditing = explicitlyEditing || !hasAnswer;
                        const saveState = savingAnswers[q.id];
                        return (
                          <div key={q.id} className="relative group">
                            <QuestionField
                              question={q}
                              index={i}
                              value={answers[q.id] ?? ""}
                              readonly={isPostClarification || !isEditing}
                              showRequiredAs="transition"
                              onChange={(val) => {
                                handleAnswerChange(q.id, val);
                              }}
                            />
                            {!isPostClarification && (
                              <div className="absolute top-0 right-0 flex items-center gap-1">
                                {saveState === "saving" && (
                                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                                )}
                                {saveState === "saved" && (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                )}
                                {hasAnswer && !isEditing && (
                                  <button
                                    onClick={() => setEditingAnswers((prev) => ({ ...prev, [q.id]: true }))}
                                    className="p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
                                    title="Edit answer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Notes */}
          <AttachedNotesSection
            task={task}
            projectId={projectId}
            onCreateNote={() => { setNotePanelOpen(false); setNoteEditorOpen(true); }}
          />

          {/* Comments */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-[13px] font-semibold">Comments</h3>
            </div>
            <CommentSection taskId={task.id} projectId={projectId} />
          </div>

        </div>
      </div>

      {/* Activity Modal */}
      {activityOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setActivityOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md mx-4 max-h-[80vh] bg-popover rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <h3 className="text-sm font-semibold">Activity</h3>
              </div>
              <button
                onClick={() => setActivityOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <ActivityTimeline taskId={task.id} refreshKey={activityKey} />
            </div>
          </div>
        </div>
      )}
      {/* Time Tracking Modal */}
      {timeTrackingOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setTimeTrackingOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md mx-4 max-h-[80vh] bg-popover rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <h3 className="text-sm font-semibold">Time Tracking</h3>
              </div>
              <button
                onClick={() => setTimeTrackingOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {startedAt && stageLogs.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Total time
                    </span>
                    <span className="text-[14px] font-semibold font-mono tabular-nums">
                      {formatDuration(new Date(startedAt), new Date())}
                    </span>
                  </div>
                  <div className="border-t border-border/30 pt-3 space-y-2">
                    {stageLogs
                      .filter((l) => l.stage !== "NEW_REQUEST" && l.stage !== "CLARIFICATION")
                      .map((log, i) => {
                        const entered = new Date(log.enteredAt);
                        const exited = log.exitedAt ? new Date(log.exitedAt) : new Date();
                        const stageInfo = STAGES.find((s) => s.id === log.stage);
                        return (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                              <span className={cn("w-2 h-2 rounded-full", stageInfo?.color ?? "bg-zinc-500")} />
                              {stageInfo?.label ?? log.stage}
                              {!log.exitedAt && <span className="text-[10px] text-primary ml-1">(current)</span>}
                            </span>
                            <span className="text-[12px] font-mono tabular-nums text-muted-foreground">
                              {formatDuration(entered, exited)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-[12px] text-muted-foreground">No time tracking yet</p>
                  <p className="text-[11px] text-muted-foreground/60">Tracking starts when the task moves to Ready for Dev</p>
                </div>
              )}
              {(task.estimatedMinutes || task.estimateAccuracy) && (
                <div className="border-t border-border/30 pt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {task.estimatedMinutes && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1 text-[12px] font-semibold text-foreground">
                        <Timer className="w-3 h-3 text-muted-foreground" />
                        Est: {formatEstimate(task.estimatedMinutes)}
                      </span>
                    )}
                    {task.estimateAccuracy && ACCURACY_CONFIG[task.estimateAccuracy] && (
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-semibold",
                        ACCURACY_CONFIG[task.estimateAccuracy].bg,
                        ACCURACY_CONFIG[task.estimateAccuracy].color
                      )}>
                        <Gauge className="w-3 h-3" />
                        {ACCURACY_CONFIG[task.estimateAccuracy].label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirm && nextStage && (() => {
        const checkpoint = getCheckpoint(task.stage as Stage, nextStage.id);
        return checkpoint ? (
          <StageConfirmDialog
            checkpoint={checkpoint}
            onConfirm={(estimatedMinutes) => executeMove(estimatedMinutes)}
            onCancel={() => setShowConfirm(false)}
          />
        ) : null;
      })()}

      {notePanelOpen && (
        <TaskNotesPanel
          task={task}
          projectId={projectId}
          taskTypeMeta={taskTypeMeta}
          onClose={() => setNotePanelOpen(false)}
          onCreateNote={() => { setNotePanelOpen(false); setNoteEditorOpen(true); }}
        />
      )}

      {noteEditorOpen && (
        <TaskNoteEditor
          task={task}
          projectId={projectId}
          taskTypeMeta={taskTypeMeta}
          onClose={() => setNoteEditorOpen(false)}
          onSaved={() => { setNoteEditorOpen(false); setNotePanelOpen(true); }}
        />
      )}
    </>
  );
}

/* ─── Task Note Editor (full-screen) ─── */

/* ─── Task Notes Panel (modal list) ─── */

function TaskNotesPanel({
  task,
  projectId,
  taskTypeMeta,
  onClose,
  onCreateNote,
}: {
  task: KanbanTask;
  projectId: string;
  taskTypeMeta: { prefix: string; label: string; color: string };
  onClose: () => void;
  onCreateNote: () => void;
}) {
  const [notes, setNotes] = useState<{ id: string; title: string; content: string; createdAt: Date; author: { name: string | null } }[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [viewingNote, setViewingNote] = useState<typeof notes[number] | null>(null);

  useEffect(() => {
    getTaskNotes(task.id).then((data) => {
      setNotes(data);
      setLoadingNotes(false);
    }).catch(() => setLoadingNotes(false));
  }, [task.id]);

  if (viewingNote) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setViewingNote(null)} />
        <div className="relative z-10 w-full max-w-2xl mx-4 max-h-[80vh] bg-popover rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <button onClick={() => setViewingNote(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <h3 className="text-sm font-semibold truncate">{viewingNote.title}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="text-[11px] text-muted-foreground mb-4">
              by {viewingNote.author.name ?? "Unknown"} · {formatDistanceToNow(new Date(viewingNote.createdAt), { addSuffix: true })}
            </div>
            {viewingNote.content ? (
              <div
                className="prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: viewingNote.content }}
              />
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">No content</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-4 max-h-[80vh] bg-popover rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold">Notes</h3>
            <span className={`text-[11px] font-medium ${taskTypeMeta.color}`}>
              {taskTypeMeta.prefix}-{String(task.taskNumber).padStart(3, "0")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onCreateNote} className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              New
            </Button>
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingNotes ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No notes for this task</p>
              <Button size="sm" variant="ghost" onClick={onCreateNote} className="mt-3 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Create first note
              </Button>
            </div>
          ) : (
            <div className="py-1">
              {notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => setViewingNote(note)}
                  className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                >
                  <p className="text-[13px] font-medium truncate">{note.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    by {note.author.name ?? "Unknown"} · {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Task Note Editor (full-screen) ─── */

function TaskNoteEditor({
  task,
  projectId,
  taskTypeMeta,
  onClose,
  onSaved,
}: {
  task: KanbanTask;
  projectId: string;
  taskTypeMeta: { prefix: string; label: string; color: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const noteType = task.taskType as "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
      await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date: new Date().toISOString().split("T")[0],
        noteType,
        taskId: task.id,
      });
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
            Close
          </button>
          <span className="text-[11px] text-muted-foreground/50">|</span>
          <span className={`text-[12px] font-medium ${taskTypeMeta.color}`}>
            {taskTypeMeta.prefix}-{String(task.taskNumber).padStart(3, "0")}
          </span>
          <span className="text-[12px] text-muted-foreground truncate max-w-[200px]">
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : "Save Note"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 sm:px-16 py-10">
          <div className="mb-6">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${taskTypeMeta.color} bg-muted/50 border-border`}>
              {taskTypeMeta.label} Note
            </span>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-8"
            autoFocus
          />

          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder="Write your note... (type / for commands)"
            borderless
          />
        </div>
      </div>
    </div>
  );
}

const ROLE_TRACK_LABELS: Record<string, string> = {
  pm: "Management",
  developer: "Development",
  client: "Client",
};

function AssigneePicker({ task, projectId }: { task: KanbanTask; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [eligible, setEligible] = useState<{ id: string; name: string | null; imageUrl: string | null; systemRole: string }[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { updateTask: updateStoreTask } = useKanbanStore();

  const STAGE_ROLE_MAP: Record<string, string> = {
    NEW_REQUEST: "pm",
    CLARIFICATION: "pm",
    READY_FOR_DEV: "developer",
    IN_DEVELOPMENT: "developer",
    INTERNAL_REVIEW: "pm",
    CLIENT_REVIEW: "client",
    READY_FOR_RELEASE: "developer",
    DONE: "developer",
  };

  const track = STAGE_ROLE_MAP[task.stage] ?? "developer";
  const trackLabel = ROLE_TRACK_LABELS[track] ?? track;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleOpen() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoadingList(true);
    try {
      const list = await getEligibleAssignees(projectId, task.stage);
      setEligible(list);
    } catch { }
    setLoadingList(false);
  }

  async function handleAssign(userId: string) {
    setSaving(true);
    try {
      await updateTask({ taskId: task.id, assigneeId: userId });
      const picked = eligible.find((u) => u.id === userId);
      if (picked) {
        updateStoreTask(task.id, { assignee: { id: picked.id, name: picked.name, imageUrl: picked.imageUrl } });
      }
      setOpen(false);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  }

  return (
    <div className="mb-5" ref={ref}>
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
        Assigned To
        <span className="ml-1.5 normal-case text-[9px] text-muted-foreground/50 font-normal">
          {trackLabel} role
        </span>
      </label>

      <button
        onClick={handleOpen}
        disabled={saving}
        className="flex items-center gap-2 w-full rounded-md border border-border px-2.5 py-1.5 text-[13px] hover:bg-accent/30 transition-colors text-left"
      >
        {task.assignee ? (
          <>
            {task.assignee.imageUrl ? (
              <img src={task.assignee.imageUrl} alt="" className="w-5 h-5 rounded-full shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                {(task.assignee.name ?? "?")[0]}
              </div>
            )}
            <span className="truncate flex-1">{task.assignee.name ?? "Unknown"}</span>
          </>
        ) : (
          <>
            <UserCircle2 className="w-5 h-5 text-muted-foreground/40 shrink-0" />
            <span className="text-muted-foreground truncate flex-1">Unassigned</span>
          </>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-1 rounded-lg border border-border bg-popover shadow-xl overflow-hidden z-50 relative">
          {loadingList ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : eligible.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground text-center">
              No eligible members for this stage
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto">
              {eligible.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleAssign(u.id)}
                  disabled={saving}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2 text-[12px] hover:bg-accent/30 transition-colors text-left disabled:opacity-50",
                    task.assignee?.id === u.id && "bg-primary/10"
                  )}
                >
                  {u.imageUrl ? (
                    <img src={u.imageUrl} alt="" className="w-5 h-5 rounded-full shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                      {(u.name ?? "?")[0]}
                    </div>
                  )}
                  <span className="truncate flex-1 font-medium">{u.name ?? "Unknown"}</span>
                  <span className="text-[9px] text-muted-foreground/50 shrink-0">{u.systemRole}</span>
                  {task.assignee?.id === u.id && <Check className="w-3 h-3 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
