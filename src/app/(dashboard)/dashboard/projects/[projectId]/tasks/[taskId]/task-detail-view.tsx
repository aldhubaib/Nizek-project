"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddButton } from "@/components/add-button";
import {
  ArrowLeft, Loader2, MessageCircleQuestion, History, MessageSquare,
  ChevronRight, ChevronDown, Pencil, Check, Clock, Undo2, Gauge, Timer,
  FileText, Paperclip, X, MoreVertical, Trash2, ExternalLink,
  CalendarClock,
} from "lucide-react";
import { getTaskAnswers, saveTaskAnswers } from "@/actions/task-question";
import { updateTask, moveTask as moveTaskAction, declineTask, deleteTask } from "@/actions/task";
import { createMeetingNote, getTaskNotes } from "@/actions/meeting-note";
import { AttachExistingNoteDialog } from "@/components/project/attach-existing-note-dialog";
import { TaskRoadmapEditor } from "@/components/project/task-roadmap-editor";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { formatDistanceToNow } from "date-fns";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import { CommentSection } from "@/components/kanban/comment-section";
import { TaskDescriptionComments } from "@/components/project/task-description-comments";
import { LinkedCountPopover } from "@/components/project/linked-count-popover";
import type { TaskHighlightThreadView } from "@/components/project/task-highlight-popover";
import { StageConfirmDialog, getCheckpoint } from "@/components/kanban/stage-confirm-dialog";
import { TaskHistoryDialog } from "@/components/kanban/task-history-dialog";
import { projectNoteUrl, isRoadmapNote } from "@/lib/project-note-url";
import { cn } from "@/lib/utils";
import { STAGES, TASK_TYPE_META } from "@/lib/constants";
import type { Stage } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";
import { markThreadRead } from "@/actions/messages";
import { closePushBannersByTags } from "@/lib/close-push-banners";
import { threadPushTag } from "@/lib/notification-read";
import { updateAppBadge } from "@/lib/app-badge";

const ACCURACY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  WAY_OVER:  { label: "Way Over",  color: "text-destructive",  bg: "bg-destructive/20 border-destructive/40" },
  OVER:      { label: "Over",      color: "text-orange-400",   bg: "bg-orange-500/20 border-orange-500/40" },
  ON_TRACK:  { label: "On Track",  color: "text-success",  bg: "bg-success/20 border-success/40" },
  UNDER:     { label: "Under",     color: "text-primary",     bg: "bg-primary/20 border-primary/40" },
  WAY_UNDER: { label: "Way Under", color: "text-violet-400",   bg: "bg-violet-500/20 border-violet-500/40" },
};

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

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


interface QuestionWithType extends TaskQuestion {
  taskType: string;
}

interface TaskData {
  id: string;
  taskNumber: number;
  title: string;
  description: string | null;
  priority: number | null;
  taskType: string;
  stage: string;
  order: number;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  createdAt: string;
  estimatedMinutes?: number | null;
  estimateAccuracy?: string | null;
}

interface StageLogData {
  startedAt: Date | null;
  logs: { stage: string; enteredAt: Date; exitedAt: Date | null }[];
}

interface NoteData {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  noteType?: string;
  author: { name: string | null };
}

interface Props {
  task: TaskData;
  projectId: string;
  projectName: string;
  questions: QuestionWithType[];
  initialAnswers: Record<string, string>;
  stageLogData: StageLogData;
  initialNotes: NoteData[];
  isAdmin: boolean;
  canSkipClientReview?: boolean;
  canDelete?: boolean;
  initialThreadId?: string | null;
  backToNoteId?: string | null;
}

export function TaskDetailPage({
  task: initialTask,
  projectId,
  projectName,
  questions: allQuestions,
  initialAnswers,
  stageLogData,
  initialNotes,
  isAdmin,
  canSkipClientReview,
  canDelete,
  initialThreadId = null,
  backToNoteId = null,
}: Props) {
  const router = useRouter();
  const questions = allQuestions.filter((q) => q.taskType === initialTask.taskType);
  const taskTypeMeta = TASK_TYPE_META[initialTask.taskType] ?? TASK_TYPE_META.FEATURE;

  // Task state (mutable for title, priority, stage)
  const [taskStage, setTaskStage] = useState<Stage>(initialTask.stage as Stage);
  const [titleValue, setTitleValue] = useState(initialTask.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [priorityValue, setPriorityValue] = useState<number | null>(initialTask.priority);

  // Questions
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const answersRef = useRef<Record<string, string>>(initialAnswers);
  const [savingAnswers, setSavingAnswers] = useState<Record<string, "saving" | "saved">>({});
  const [editingAnswers, setEditingAnswers] = useState<Record<string, boolean>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Stage movement
  const [movingStage, setMovingStage] = useState(false);
  const [moveError, setMoveError] = useState<string[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineComment, setDeclineComment] = useState("");
  const [declineFiles, setDeclineFiles] = useState<File[]>([]);
  const declineFileRef = useRef<HTMLInputElement>(null);
  const declinePasteRef = usePasteFiles(
    (files) => setDeclineFiles((prev) => [...prev, ...files]),
    { enabled: showDecline, capture: true },
  );
  const [declining, setDeclining] = useState(false);
  const [showAdminStages, setShowAdminStages] = useState(false);
  const adminStagesRef = useRef<HTMLDivElement>(null);

  // Sections
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [activityKey, setActivityKey] = useState(0);
  const [commentKey, setCommentKey] = useState(0);
  const [timeTrackingOpen, setTimeTrackingOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Opening the task counts as reading its mention notifications — same
  // client-owned read path as chat (prefetch must never mark read).
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      const tag = threadPushTag({ taskId: initialTask.id, projectId });
      if (tag) void closePushBannersByTags([tag]);
      void markThreadRead({ taskId: initialTask.id, projectId })
        .then((counts) => {
          if (counts && typeof counts.unread === "number") {
            updateAppBadge(Math.max(0, counts.unread));
          }
        })
        .catch(() => {});
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [initialTask.id, projectId]);

  // Header actions menu
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);

  // Notes + roadmap (same NoteTaskLink; split by noteType)
  const [notes, setNotes] = useState<NoteData[]>(initialNotes);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [attachNoteOpen, setAttachNoteOpen] = useState(false);
  const [roadmapEditorOpen, setRoadmapEditorOpen] = useState(false);
  const [attachRoadmapOpen, setAttachRoadmapOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [highlightThreads, setHighlightThreads] = useState<TaskHighlightThreadView[]>([]);
  const [headerThreadId, setHeaderThreadId] = useState<string | null>(initialThreadId);

  // Time tracking
  const startedAt = stageLogData.startedAt ? new Date(stageLogData.startedAt).toISOString() : null;
  const stageLogs = stageLogData.logs.map((l) => ({
    stage: l.stage,
    enteredAt: new Date(l.enteredAt).toISOString(),
    exitedAt: l.exitedAt ? new Date(l.exitedAt).toISOString() : null,
  }));

  const currentStageIndex = STAGES.findIndex((s) => s.id === taskStage);
  const nextStage = currentStageIndex < STAGES.length - 1 ? STAGES[currentStageIndex + 1] : null;
  const clarificationIndex = STAGES.findIndex((s) => s.id === "CLARIFICATION");
  const isPostClarification = currentStageIndex > clarificationIndex;

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (!showAdminStages) return;
    function handleClick(e: MouseEvent) {
      if (adminStagesRef.current && !adminStagesRef.current.contains(e.target as Node)) {
        setShowAdminStages(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAdminStages]);

  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  async function handleDeleteTask() {
    if (deleting) return;
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setShowMenu(false);
    setDeleting(true);
    try {
      await deleteTask(initialTask.id);
      router.push(`/dashboard/projects/${projectId}`);
    } catch (err) {
      alert((err as Error).message);
      setDeleting(false);
    }
  }

  async function handleAdminStageChange(stage: Stage) {
    if (stage === taskStage || movingStage) return;
    setShowAdminStages(false);
    setMovingStage(true);
    setMoveError(null);
    try {
      const result = await moveTaskAction({ taskId: initialTask.id, stage, order: initialTask.order });
      if (!result.success) {
        const msg = result.error ?? "";
        if (msg.startsWith("WIP_LIMIT:")) {
          const max = msg.replace("WIP_LIMIT:", "");
          setMoveError([`Pipeline limit reached — this project allows up to ${max} active tasks across In Development and Internal Review. Move an existing task past Internal Review before adding another.`]);
        } else {
          setMoveError([msg || "Failed to change stage"]);
        }
        return;
      }
      setTaskStage(stage);
      setActivityKey((k) => k + 1);
    } catch (err: any) {
      setMoveError([err?.message ?? "Failed to change stage"]);
    } finally {
      setMovingStage(false);
    }
  }

  async function handleTitleSave() {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === initialTask.title) {
      setTitleValue(initialTask.title);
      return;
    }
    try {
      await updateTask({ taskId: initialTask.id, title: trimmed });
      setActivityKey((k) => k + 1);
    } catch {
      setTitleValue(initialTask.title);
    }
  }

  async function handlePrioritySave(newPriority: number | null) {
    const oldPriority = priorityValue;
    setPriorityValue(newPriority);
    if (newPriority === initialTask.priority) return;
    try {
      await updateTask({ taskId: initialTask.id, priority: newPriority });
      setActivityKey((k) => k + 1);
    } catch {
      setPriorityValue(oldPriority);
    }
  }

  function handleAnswerChange(questionId: string, value: string) {
    const updated = { ...answersRef.current, [questionId]: value };
    setAnswers(updated);
    answersRef.current = updated;
    setEditingAnswers((prev) => ({ ...prev, [questionId]: true }));
    debouncedSaveAnswer(questionId, value);
  }

  function debouncedSaveAnswer(questionId: string, value: string) {
    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(async () => {
      setSavingAnswers((prev) => ({ ...prev, [questionId]: "saving" }));
      try {
        await saveTaskAnswers({ taskId: initialTask.id, answers: [{ questionId, answer: value }] });
        setSavingAnswers((prev) => ({ ...prev, [questionId]: "saved" }));
        setMoveError(null);
        setActivityKey((k) => k + 1);
        setTimeout(() => setSavingAnswers((prev) => { const next = { ...prev }; delete next[questionId]; return next; }), 1500);
      } catch {
        setSavingAnswers((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
      }
    }, 800);
  }

  function handleMoveToNext() {
    if (!nextStage || movingStage) return;
    const checkpoint = getCheckpoint(taskStage, nextStage.id);
    if (checkpoint) { setShowConfirm(true); return; }
    executeMove();
  }

  async function executeMove(estimatedMinutes?: number) {
    if (!nextStage) return;
    setMovingStage(true);
    setMoveError(null);
    setShowConfirm(false);
    try {
      const result = await moveTaskAction({ taskId: initialTask.id, stage: nextStage.id, order: initialTask.order, estimatedMinutes });
      if (!result.success) {
        const msg = result.error;
        if (msg.startsWith("REQUIRED_QUESTIONS:")) {
          try { setMoveError(JSON.parse(msg.replace("REQUIRED_QUESTIONS:", ""))); setQuestionsOpen(true); }
          catch { setMoveError(["Some required questions are unanswered"]); }
        } else if (msg.startsWith("PRIORITY_BLOCKED:")) {
          try { setMoveError(["Higher priority tasks must move first:", ...JSON.parse(msg.replace("PRIORITY_BLOCKED:", ""))]); }
          catch { setMoveError(["Higher priority tasks must be completed first"]); }
        } else if (msg === "ESTIMATE_REQUIRED") {
          setMoveError(["An estimated time is required"]);
        } else if (msg.startsWith("WIP_LIMIT:")) {
          const max = msg.replace("WIP_LIMIT:", "");
          setMoveError([`Pipeline limit reached — up to ${max} active tasks are allowed across In Development and Internal Review. Move an existing task past Internal Review before adding another.`]);
        } else {
          setMoveError([msg || "Failed to move task. Please try again."]);
        }
        return;
      }
      setTaskStage(nextStage.id);
      setActivityKey((k) => k + 1);
    } catch (err) {
      setMoveError([(err as Error).message || "Failed to move task. Please try again."]);
    } finally {
      setMovingStage(false);
    }
  }

  const showSkipButton = taskStage === "INTERNAL_REVIEW" && canSkipClientReview && initialTask.taskType !== "BUG" && initialTask.taskType !== "REPORTED_BUG";
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  function handleSkipClientReview() {
    setShowSkipConfirm(true);
  }

  async function executeSkip() {
    setMovingStage(true);
    setMoveError(null);
    setShowSkipConfirm(false);
    try {
      const result = await moveTaskAction({ taskId: initialTask.id, stage: "DONE", order: initialTask.order });
      if (!result.success) {
        setMoveError([result.error || "Failed to skip. Please try again."]);
        return;
      }
      setTaskStage("DONE");
      setActivityKey((k) => k + 1);
    } catch (err) {
      setMoveError([(err as Error).message || "Failed to skip. Please try again."]);
    } finally {
      setMovingStage(false);
    }
  }

  const canDecline = taskStage === "INTERNAL_REVIEW" || taskStage === "CLIENT_REVIEW";
  const declineTargetStage = taskStage === "CLIENT_REVIEW" ? "INTERNAL_REVIEW" : "IN_DEVELOPMENT";
  const declineTargetLabel = taskStage === "CLIENT_REVIEW" ? "Internal Review" : "In Development";

  async function handleDecline() {
    if (!declineComment.trim() || declining) return;
    setDeclining(true);
    try {
      let attachments: { filename: string; url: string; fileSize: number; mimeType: string }[] | undefined;
      if (declineFiles.length > 0) {
        attachments = await Promise.all(
          declineFiles.map(async (file) => {
            const up = await uploadFileToR2(file);
            return { filename: file.name, url: up.url, fileSize: file.size, mimeType: file.type };
          })
        );
      }
      const result = await declineTask({ taskId: initialTask.id, comment: declineComment.trim(), attachments });
      if (!result.success) {
        alert(`Failed to decline task: ${result.error}`);
        return;
      }
      setTaskStage(declineTargetStage as Stage);
      setActivityKey((k) => k + 1);
      setCommentKey((k) => k + 1);
      setShowDecline(false);
      setDeclineComment("");
      setDeclineFiles([]);
    } catch (err) {
      console.error(err);
    } finally {
      setDeclining(false);
    }
  }

  async function refreshNotes() {
    const data = await getTaskNotes(initialTask.id);
    setNotes(data);
  }

  const attachedNotes = notes.filter((n) => !isRoadmapNote(n.noteType));
  const attachedRoadmaps = notes.filter((n) => isRoadmapNote(n.noteType));

  return (
    <div className="min-h-screen">
      {/* Header */}
      <PageHeader>
        <button
          onClick={() =>
            router.push(
              backToNoteId
                ? projectNoteUrl(projectId, backToNoteId)
                : `/dashboard/projects/${projectId}`,
            )
          }
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={backToNoteId ? "Back to note" : "Back to project"}
          aria-label={backToNoteId ? "Back to note" : "Back to project"}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground font-mono truncate">{projectName}</span>
          <span className="text-xs text-muted-foreground/40">/</span>
          <span className={cn("text-xs font-semibold", taskTypeMeta.color)}>
            {taskTypeMeta.prefix}-{String(initialTask.taskNumber).padStart(3, "0")}
          </span>
        </div>
        <button
          onClick={() => setShowHistory(true)}
          title="Task history"
          className="ms-auto flex items-center gap-xs rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
        {canDelete && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              disabled={deleting}
              title="More actions"
              className="flex items-center justify-center rounded-md border border-border w-7 h-7 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
            </button>
            {showMenu && (
              <div className="absolute top-full right-0 mt-1.5 z-50 rounded-lg border border-border bg-card shadow-xl py-1 min-w-[160px]">
                <button
                  onClick={handleDeleteTask}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-s font-medium text-destructive hover:bg-destructive/10 transition-colors text-start"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete task
                </button>
              </div>
            )}
          </div>
        )}
      </PageHeader>

      {/* Single-column layout */}
      <div className="max-w-2xl mx-auto px-app py-8 space-y-6">
        {/* Title */}
        <div>
          {editingTitle && !isPostClarification ? (
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleSave();
                if (e.key === "Escape") { setTitleValue(initialTask.title); setEditingTitle(false); }
              }}
              className="text-m font-bold bg-transparent border-b border-primary outline-none w-full"
            />
          ) : (
            <h1
              className={cn("text-m font-bold", !isPostClarification && "cursor-text hover:text-primary/80 transition-colors")}
              onClick={() => !isPostClarification && setEditingTitle(true)}
            >
              {titleValue}
            </h1>
          )}
          {(attachedNotes.length > 0 || attachedRoadmaps.length > 0 || highlightThreads.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-s text-muted-foreground/70">
              {attachedNotes.length > 0 && (
                <LinkedCountPopover
                  count={attachedNotes.length}
                  singular="Note"
                  plural="Notes"
                  icon={FileText}
                  open={notesOpen}
                  onOpenChange={setNotesOpen}
                >
                  {attachedNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        setNotesOpen(false);
                        router.push(projectNoteUrl(projectId, note.id, { noteType: note.noteType }));
                      }}
                      className="flex w-full items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-start text-s hover:border-border"
                    >
                      <span className="min-w-0 flex-1 truncate">{note.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </LinkedCountPopover>
              )}
              {attachedRoadmaps.length > 0 && (
                <LinkedCountPopover
                  count={attachedRoadmaps.length}
                  singular="Deadline item"
                  plural="Deadline items"
                  icon={CalendarClock}
                  open={roadmapOpen}
                  onOpenChange={setRoadmapOpen}
                >
                  {attachedRoadmaps.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        setRoadmapOpen(false);
                        router.push(projectNoteUrl(projectId, note.id, { noteType: note.noteType }));
                      }}
                      className="flex w-full items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-start text-s hover:border-border"
                    >
                      <span className="min-w-0 flex-1 truncate">{note.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </LinkedCountPopover>
              )}
              {(attachedNotes.length > 0 || attachedRoadmaps.length > 0) && highlightThreads.length > 0 && <span>·</span>}
              {highlightThreads.length > 0 && (
                <LinkedCountPopover
                  count={highlightThreads.length}
                  singular="Comment"
                  plural="Comments"
                  icon={MessageSquare}
                  open={commentsOpen}
                  onOpenChange={setCommentsOpen}
                >
                  {highlightThreads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-note-comment-ui
                      onClick={() => {
                        setCommentsOpen(false);
                        setHeaderThreadId(t.id);
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
              )}
            </div>
          )}
          {initialTask.description && (
            <div className="mt-3">
              <TaskDescriptionComments
                description={initialTask.description}
                taskId={initialTask.id}
                projectId={projectId}
                initialThreadId={headerThreadId}
                onThreadsChange={setHighlightThreads}
              />
            </div>
          )}
        </div>

        {/* Type, Priority, Assigned To, Created By */}
        <div className="rounded-xl bg-card border border-border p-5 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="text-s font-semibold text-foreground mb-2 block">Type</label>
              <span className={cn("inline-flex items-center gap-xs rounded-lg border px-3 py-1.5 text-s font-medium", taskTypeMeta.color,
                taskTypeMeta.color === "text-primary" ? "bg-primary/15 border-primary/20"
                : taskTypeMeta.color === "text-violet-400" ? "bg-violet-500/15 border-violet-500/20"
                : taskTypeMeta.color === "text-orange" ? "bg-orange/15 border-orange/20"
                : taskTypeMeta.color === "text-destructive" ? "bg-destructive/15 border-destructive/20"
                : "bg-cyan-500/15 border-cyan-500/20"
              )}>{taskTypeMeta.label}</span>
            </div>

            <div>
              <label className="text-s font-semibold text-foreground mb-2 block">Created By</label>
              <div className="flex items-center gap-2">
                {initialTask.createdBy.imageUrl ? (
                  <img src={initialTask.createdBy.imageUrl} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {(initialTask.createdBy.name ?? "?")[0]}
                  </div>
                )}
                <span className="text-s text-foreground">{initialTask.createdBy.name ?? "Unknown"}</span>
              </div>
            </div>
          </div>

          {initialTask.assignee && (
            <div>
              <label className="text-s font-semibold text-foreground mb-2 block">Assigned To</label>
              <div className="flex items-center gap-2">
                {initialTask.assignee.imageUrl ? (
                  <img src={initialTask.assignee.imageUrl} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {(initialTask.assignee.name ?? "?")[0]}
                  </div>
                )}
                <span className="text-s text-foreground">{initialTask.assignee.name ?? "Unknown"}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-s font-semibold text-foreground mb-2 block">Priority</label>
            {isPostClarification ? (
              priorityValue != null ? (
                <span className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-s font-semibold",
                  priorityValue >= 9 ? "bg-destructive/20 border-destructive/40 text-destructive"
                    : priorityValue >= 7 ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                    : priorityValue >= 4 ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-muted border-border text-foreground"
                )}>P{priorityValue}</span>
              ) : <span className="text-s text-muted-foreground/50">No priority</span>
            ) : (
              <div className="flex flex-wrap gap-xs">
                <button type="button" onClick={() => handlePrioritySave(null)}
                  className={cn("h-8 rounded-md border px-3 text-s font-medium transition-colors",
                    priorityValue == null ? "bg-orange/20 border-orange/40 text-orange" : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  )}>None</button>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button key={n} type="button" onClick={() => handlePrioritySave(n)}
                    className={cn("h-8 w-8 rounded-md border text-s font-medium transition-colors",
                      priorityValue === n
                        ? n >= 9 ? "bg-destructive/20 border-destructive/40 text-destructive"
                          : n >= 7 ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                          : n >= 4 ? "bg-primary/20 border-primary/40 text-primary"
                          : "bg-muted border-primary/40 text-foreground"
                        : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    )}>{n}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="rounded-xl bg-card border border-border p-5">
          <label className="text-s font-semibold text-foreground mb-3 block">Status</label>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin ? (
              <div className="relative" ref={adminStagesRef}>
                <button
                  onClick={() => setShowAdminStages(!showAdminStages)}
                  disabled={movingStage}
                  className="inline-flex items-center gap-xs rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/15 border-primary/20 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
                >
                  {movingStage ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <span className={cn("w-2 h-2 rounded-full", STAGES[currentStageIndex]?.color)} />
                      {STAGES[currentStageIndex]?.label}
                      <ChevronDown className="w-3 h-3 ms-0.5" />
                    </>
                  )}
                </button>
                {showAdminStages && (
                  <div className="absolute top-full left-0 mt-1.5 z-50 rounded-lg border border-border bg-card shadow-xl py-1 min-w-[180px]">
                    {STAGES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleAdminStageChange(s.id)}
                        disabled={s.id === taskStage}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-s font-medium transition-colors text-start",
                          s.id === taskStage
                            ? "text-primary bg-primary/10"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <span className={cn("w-2 h-2 rounded-full shrink-0", s.color)} />
                        {s.label}
                        {s.id === taskStage && <Check className="w-3 h-3 ms-auto text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-xs rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/15 border-primary/20 text-primary">
                <span className={cn("w-2 h-2 rounded-full", STAGES[currentStageIndex]?.color)} />
                {STAGES[currentStageIndex]?.label}
              </span>
            )}
            {nextStage && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                <button
                  onClick={handleMoveToNext}
                  disabled={movingStage}
                  className="inline-flex items-center gap-xs rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
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
          {showSkipButton && (
            <div className="mt-2">
              <button
                onClick={handleSkipClientReview}
                disabled={movingStage}
                className="inline-flex items-center gap-xs text-xs font-medium text-orange/80 hover:text-orange transition-colors disabled:opacity-50"
              >
                <ChevronRight className="w-3 h-3" />
                Skip Client Review → Done
              </button>
            </div>
          )}
          {canDecline && (
            <div className="mt-3">
              {!showDecline ? (
                <button
                  onClick={() => setShowDecline(true)}
                  className="inline-flex items-center gap-xs text-xs font-medium text-destructive/70 hover:text-destructive transition-colors"
                >
                  <Undo2 className="w-3 h-3" />
                  Decline &amp; return to {declineTargetLabel}
                </button>
              ) : (
                <div
                  ref={declinePasteRef}
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2.5 mt-2"
                >
                  <p className="text-xs font-medium text-destructive">Why is this being declined?</p>
                  <textarea
                    value={declineComment}
                    onChange={(e) => setDeclineComment(e.target.value)}
                    placeholder="Explain what needs to be fixed... Paste screenshots to attach"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-s text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-destructive/50 resize-none"
                    rows={3}
                    autoFocus
                  />
                  {declineFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {declineFiles.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-xs text-foreground/70">
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
                    <Button size="sm" variant="destructive" onClick={handleDecline} disabled={!declineComment.trim() || declining} className="h-7 text-xs">
                      {declining ? <Loader2 className="w-3 h-3 animate-spin me-1" /> : <Undo2 className="w-3 h-3 me-1" />}
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
                    <Button size="sm" variant="ghost" onClick={() => { setShowDecline(false); setDeclineComment(""); setDeclineFiles([]); }} className="h-7 text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {moveError && (
            <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-xs font-medium text-destructive mb-1">Answer these required questions first:</p>
              <ul className="space-y-0.5">
                {moveError.map((q, i) => (
                  <li key={i} className="text-xs text-destructive/80">• {q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Questions */}
        {questions.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-5">
            <button onClick={() => setQuestionsOpen((v) => !v)} className="flex items-center gap-2 w-full text-start">
              <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-s font-semibold flex-1">Questions</h3>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", questionsOpen && "rotate-180")} />
            </button>
            {questionsOpen && (
              <div className="space-y-5 mt-4">
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
                        onChange={(val) => handleAnswerChange(q.id, val)}
                      />
                      {!isPostClarification && (
                        <div className="absolute top-0 right-0 flex items-center gap-1">
                          {saveState === "saving" && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                          {saveState === "saved" && <Check className="w-3 h-3 text-success" />}
                          {hasAnswer && !isEditing && (
                            <button
                              onClick={() => setEditingAnswers((prev) => ({ ...prev, [q.id]: true }))}
                              className="p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
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
          </div>
        )}

        {/* Time Tracking */}
        <div className="rounded-xl bg-card border border-border p-5">
          <button onClick={() => setTimeTrackingOpen(!timeTrackingOpen)} className="flex items-center gap-2 w-full text-start">
            <Clock className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-s font-semibold flex-1">Time Tracking</h3>
            {initialTask.estimatedMinutes ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                <Timer className="w-3 h-3 text-muted-foreground" />
                Est {formatEstimate(initialTask.estimatedMinutes)}
              </span>
            ) : null}
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", timeTrackingOpen && "rotate-180")} />
          </button>
          {timeTrackingOpen && (
            <div className="mt-4 space-y-3">
              {startedAt && stageLogs.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-s text-muted-foreground flex items-center gap-xs">
                      <Clock className="w-3.5 h-3.5" /> Total time
                    </span>
                    <span className="text-s font-semibold font-mono tabular-nums">
                      {formatDuration(new Date(startedAt), new Date())}
                    </span>
                  </div>
                  <div className="border-t border-border/30 pt-3 space-y-2">
                    {stageLogs
                      .filter((l) => l.stage !== "BACKLOG" && l.stage !== "CLARIFICATION")
                      .map((log, i) => {
                        const entered = new Date(log.enteredAt);
                        const exited = log.exitedAt ? new Date(log.exitedAt) : new Date();
                        const stageInfo = STAGES.find((s) => s.id === log.stage);
                        return (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-s text-muted-foreground flex items-center gap-xs">
                              <span className={cn("w-2 h-2 rounded-full", stageInfo?.color ?? "bg-muted-foreground")} />
                              {stageInfo?.label ?? log.stage}
                              {!log.exitedAt && <span className="text-xs text-primary ms-1">(current)</span>}
                            </span>
                            <span className="text-s font-mono tabular-nums text-muted-foreground">
                              {formatDuration(entered, exited)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Clock className="w-6 h-6 text-muted-foreground/30 mb-1" />
                  <p className="text-xs text-muted-foreground/60">Tracking starts at In Development</p>
                </div>
              )}
              {(initialTask.estimatedMinutes || initialTask.estimateAccuracy) && (
                <div className="border-t border-border/30 pt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {initialTask.estimatedMinutes && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1 text-s font-semibold text-foreground">
                        <Timer className="w-3 h-3 text-muted-foreground" /> Est: {formatEstimate(initialTask.estimatedMinutes)}
                      </span>
                    )}
                    {initialTask.estimateAccuracy && ACCURACY_CONFIG[initialTask.estimateAccuracy] && (
                      <span className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-s font-semibold", ACCURACY_CONFIG[initialTask.estimateAccuracy].bg, ACCURACY_CONFIG[initialTask.estimateAccuracy].color)}>
                        <Gauge className="w-3 h-3" /> {ACCURACY_CONFIG[initialTask.estimateAccuracy].label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-s font-semibold">Notes</h3>
              {attachedNotes.length > 0 && (
                <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                  {attachedNotes.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setAttachNoteOpen(true)} className="h-7 text-s">
                Attach
              </Button>
              <AddButton label="New note" onClick={() => setNoteEditorOpen(true)} />
            </div>
          </div>
          {attachedNotes.length === 0 ? (
            <p className="text-s text-muted-foreground/60 py-2">No notes attached</p>
          ) : (
            <div className="space-y-2">
              {attachedNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => router.push(projectNoteUrl(projectId, note.id, { noteType: note.noteType }))}
                  className="w-full text-start rounded-lg border border-border/60 bg-background p-3 hover:border-border transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-s font-medium text-primary truncate">{note.title}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ms-2">
                      {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">by {note.author.name ?? "Unknown"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Roadmap */}
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="text-s font-semibold">Roadmap</h3>
              {attachedRoadmaps.length > 0 && (
                <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                  {attachedRoadmaps.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setAttachRoadmapOpen(true)} className="h-7 text-s">
                Attach
              </Button>
              <AddButton label="New deadline item" onClick={() => setRoadmapEditorOpen(true)} />
            </div>
          </div>
          {attachedRoadmaps.length === 0 ? (
            <p className="text-s text-muted-foreground/60 py-2">No deadline items attached</p>
          ) : (
            <div className="space-y-2">
              {attachedRoadmaps.map((note) => (
                <button
                  key={note.id}
                  onClick={() => router.push(projectNoteUrl(projectId, note.id, { noteType: note.noteType }))}
                  className="w-full text-start rounded-lg border border-border/60 bg-background p-3 hover:border-border transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-s font-medium text-primary truncate">{note.title}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ms-2">
                      {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">by {note.author.name ?? "Unknown"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-s font-semibold">Comments</h3>
          </div>
          <CommentSection key={`comments-${initialTask.id}-${commentKey}`} taskId={initialTask.id} projectId={projectId} />
        </div>
      </div>

      {/* Stage confirm dialog */}
      {showConfirm && nextStage && (() => {
        const checkpoint = getCheckpoint(taskStage, nextStage.id);
        return checkpoint ? (
          <StageConfirmDialog
            checkpoint={checkpoint}
            onConfirm={(estimatedMinutes) => executeMove(estimatedMinutes)}
            onCancel={() => setShowConfirm(false)}
          />
        ) : null;
      })()}

      {showSkipConfirm && (() => {
        const checkpoint = getCheckpoint("INTERNAL_REVIEW" as Stage, "DONE" as Stage);
        return checkpoint ? (
          <StageConfirmDialog
            checkpoint={checkpoint}
            onConfirm={() => executeSkip()}
            onCancel={() => setShowSkipConfirm(false)}
          />
        ) : null;
      })()}

      {/* Task history popup */}
      {showHistory && (
        <TaskHistoryDialog
          taskId={initialTask.id}
          refreshKey={activityKey}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Note editor (full-screen) */}
      {noteEditorOpen && (
        <TaskNoteEditor
          task={initialTask}
          projectId={projectId}
          taskTypeMeta={taskTypeMeta}
          onClose={() => setNoteEditorOpen(false)}
          onSaved={() => { setNoteEditorOpen(false); refreshNotes(); setActivityKey((k) => k + 1); }}
        />
      )}

      {roadmapEditorOpen && (
        <TaskRoadmapEditor
          task={initialTask}
          projectId={projectId}
          taskTypeMeta={taskTypeMeta}
          onClose={() => setRoadmapEditorOpen(false)}
          onSaved={() => { setRoadmapEditorOpen(false); refreshNotes(); setActivityKey((k) => k + 1); }}
        />
      )}

      <AttachExistingNoteDialog
        open={attachNoteOpen}
        onClose={() => setAttachNoteOpen(false)}
        projectId={projectId}
        taskId={initialTask.id}
        kind="notes"
        onAttached={() => { refreshNotes(); setActivityKey((k) => k + 1); }}
      />

      <AttachExistingNoteDialog
        open={attachRoadmapOpen}
        onClose={() => setAttachRoadmapOpen(false)}
        projectId={projectId}
        taskId={initialTask.id}
        kind="sprints"
        onAttached={() => { refreshNotes(); setActivityKey((k) => k + 1); }}
      />
    </div>
  );
}

function TaskNoteEditor({
  task,
  projectId,
  taskTypeMeta,
  onClose,
  onSaved,
}: {
  task: TaskData;
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
      <div className="flex app-top-bar items-center justify-between px-4 shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-s text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs text-muted-foreground/50">|</span>
          <span className={`text-s font-medium ${taskTypeMeta.color}`}>
            {taskTypeMeta.prefix}-{String(task.taskNumber).padStart(3, "0")}
          </span>
          <span className="text-s text-muted-foreground truncate max-w-[200px]">{task.title}</span>
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
            <span className={`inline-flex items-center gap-xs rounded-full border px-3 py-1 text-xs font-semibold ${taskTypeMeta.color} bg-muted/50 border-border`}>
              {taskTypeMeta.label} Note
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="w-full text-m font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-8"
            autoFocus
          />
          <RichTextEditor content={content} onChange={setContent} placeholder="Write your note... (type / for commands)" borderless projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
