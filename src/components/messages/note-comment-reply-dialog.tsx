"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  deleteMeetingNote,
  getMeetingNote,
  getNoteWorkspace,
  toggleDeadlineComplete,
} from "@/actions/meeting-note";
import {
  NoteFullScreenDetail,
  type MeetingNote,
} from "@/components/project/meeting-notes-tab";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { roadmapScheduleError } from "@/lib/roadmap-status";

export function NoteCommentReplyDialog({
  open,
  onOpenChange,
  noteId,
  threadId,
  noteTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  threadId?: string;
  noteTitle: string;
  projectId: string;
}) {
  const [note, setNote] = useState<MeetingNote | null>(null);
  const [workspace, setWorkspace] = useState<Awaited<
    ReturnType<typeof getNoteWorkspace>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNote(null);
      setWorkspace(null);
      setError(null);
      setScheduleError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getNoteWorkspace(noteId)
      .then((data) => {
        if (cancelled) return;
        setWorkspace(data);
        setNote(data.note as unknown as MeetingNote);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load note");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, noteId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || note) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, note, onOpenChange]);

  const refreshNote = useCallback(async () => {
    const fresh = await getMeetingNote(noteId);
    setNote(fresh as unknown as MeetingNote);
  }, [noteId]);

  const toggleComplete = useCallback(async () => {
    if (!note) return;
    if (!note.completedAt) {
      const blocked = roadmapScheduleError("SHIPPED", note.dueDate, note.workingDays);
      if (blocked) {
        setScheduleError(blocked);
        return;
      }
    }
    setScheduleError(null);
    const { completedAt, roadmapStatus } = await toggleDeadlineComplete(note.id);
    setNote((prev) => (prev ? { ...prev, completedAt, roadmapStatus } : prev));
  }, [note]);

  if (!open) return null;

  if (loading && !note) {
    return (
      <NoteSlideOver title={noteTitle} onClose={() => onOpenChange(false)}>
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading note…
        </div>
      </NoteSlideOver>
    );
  }

  if (error && !note) {
    return (
      <NoteSlideOver title={noteTitle} onClose={() => onOpenChange(false)}>
        <p className="px-4 py-10 text-center text-[13px] text-destructive">{error}</p>
      </NoteSlideOver>
    );
  }

  if (!note || !workspace) return null;

  return (
    <NoteFullScreenDetail
      note={note}
      projectId={workspace.projectId}
      canEdit={workspace.canEdit}
      isSystemAdmin={workspace.isSystemAdmin}
      isDeadlineTestProject={workspace.isDeadlineTestProject}
      allowedTaskTypes={workspace.allowedTaskTypes}
      activeContractType={workspace.activeContractType}
      isActive={workspace.isActive}
      initialThreadId={threadId ?? null}
      currentUserId={workspace.currentUserId}
      onToggleComplete={toggleComplete}
      scheduleError={scheduleError}
      onRefresh={refreshNote}
      onClose={() => onOpenChange(false)}
      onDelete={async () => {
        await deleteMeetingNote(note.id);
        onOpenChange(false);
      }}
    />
  );
}
