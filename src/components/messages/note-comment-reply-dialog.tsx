"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getNoteCommentThread, getNoteCommentThreads } from "@/actions/note-comment";
import { getMeetingNote } from "@/actions/meeting-note";
import {
  NoteCommentPopover,
  type NoteCommentThreadView,
} from "@/components/project/note-comment-panel";
import { NoteAnnotatedContent } from "@/components/project/note-annotated-content-lazy";
import { cn } from "@/lib/utils";

type NotePreview = {
  title: string;
  content: string;
  projectId: string;
  linked: { id: string; title: string; taskNumber: number; taskType: string }[];
  threads: NoteCommentThreadView[];
};

export function NoteCommentReplyDialog({
  open,
  onOpenChange,
  noteId,
  threadId,
  noteTitle,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  threadId: string;
  noteTitle: string;
  projectId: string;
}) {
  const [thread, setThread] = useState<NoteCommentThreadView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"thread" | "note">("thread");
  const [note, setNote] = useState<NotePreview | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNoteCommentThread(threadId);
      setThread({
        id: data.id,
        quoteText: data.quoteText,
        conversationId: data.conversationId,
        comments: data.comments,
        understood: data.understood,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  const loadNote = useCallback(async () => {
    setNoteLoading(true);
    setNoteError(null);
    try {
      const [full, threads] = await Promise.all([
        getMeetingNote(noteId),
        getNoteCommentThreads(noteId),
      ]);
      const linkedMap = new Map<string, NotePreview["linked"][number]>();
      if (full.task) linkedMap.set(full.task.id, full.task);
      for (const link of full.taskLinks ?? []) linkedMap.set(link.task.id, link.task);
      setNote({
        title: full.title,
        content: full.content,
        projectId: full.projectId,
        linked: [...linkedMap.values()],
        threads: threads.map((t) => ({
          id: t.id,
          quoteText: t.quoteText,
          conversationId: t.conversationId,
          comments: t.comments,
          understood: t.id === threadId ? (thread?.understood ?? false) : false,
        })),
      });
      setActiveThreadId(threadId);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to load note");
    } finally {
      setNoteLoading(false);
    }
  }, [noteId, threadId, thread?.understood]);

  useEffect(() => {
    if (!open) {
      setView("thread");
      setNote(null);
      return;
    }
    void load();
  }, [open, load]);

  async function openFullNote() {
    setView("note");
    if (!note) await loadNote();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "gap-0 overflow-hidden p-0",
          view === "note" ? "flex max-h-[90dvh] flex-col sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {view === "note" ? noteTitle : `Reply on “${noteTitle}”`}
          </DialogTitle>
          <DialogDescription>
            {view === "note"
              ? "Full note, scrolled to this highlight."
              : "Comment thread on this note highlight."}
          </DialogDescription>
        </DialogHeader>

        {view === "note" ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
              <button
                type="button"
                onClick={() => setView("thread")}
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Back to reply"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{noteTitle}</p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {noteLoading && !note ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading note…
                </div>
              ) : noteError && !note ? (
                <p className="py-8 text-center text-[13px] text-destructive">{noteError}</p>
              ) : note ? (
                <NoteAnnotatedContent
                  content={note.content}
                  noteId={noteId}
                  projectId={note.projectId || projectId}
                  canCreateTask={false}
                  threads={note.threads}
                  openThreadId={activeThreadId}
                  onOpenThread={setActiveThreadId}
                  taskUrl={(taskId) =>
                    `/dashboard/projects/${note.projectId || projectId}/tasks/${taskId}?from=note&noteId=${noteId}`
                  }
                  linkedTasks={note.linked}
                  onCreateTask={() => undefined}
                  onChanged={() => {
                    void load();
                    void loadNote();
                  }}
                />
              ) : null}
            </div>
          </>
        ) : loading && !thread ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading comments…
          </div>
        ) : error && !thread ? (
          <p className="px-4 py-8 text-center text-[13px] text-destructive">{error}</p>
        ) : thread ? (
          <NoteCommentPopover
            thread={thread}
            noteId={noteId}
            hideChatLink
            onViewNote={() => void openFullNote()}
            className="w-full max-w-none rounded-none border-0 shadow-none"
            onClose={() => onOpenChange(false)}
            onChanged={() => void load()}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
