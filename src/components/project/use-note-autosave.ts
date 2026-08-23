"use client";

import { useEffect, useRef, useState } from "react";
import { updateMeetingNote } from "@/actions/meeting-note";
import { documentDateIsoFromPlanningHtml } from "@/lib/sprint-planning-doc";

export function useNoteAutosave({
  noteId,
  title,
  content,
  enabled,
}: {
  noteId: string | null;
  title: string;
  content: string;
  enabled: boolean;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipFirst = useRef(true);
  const latest = useRef({ title, content, noteId, enabled });
  latest.current = { title, content, noteId, enabled };

  useEffect(() => {
    skipFirst.current = true;
  }, [noteId]);

  useEffect(() => {
    if (!enabled || !noteId) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      const nextTitle = latest.current.title.trim();
      if (!nextTitle) return;
      try {
        await updateMeetingNote({
          noteId,
          title: nextTitle,
          content: latest.current.content,
          date: documentDateIsoFromPlanningHtml(latest.current.content) ?? undefined,
        });
        setSaveError(null);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Could not save");
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [enabled, noteId, title, content]);

  useEffect(() => {
    return () => {
      const { noteId: id, title: t, content: c, enabled: on } = latest.current;
      if (!on || !id || !t.trim()) return;
      void updateMeetingNote({
        noteId: id,
        title: t.trim(),
        content: c,
        date: documentDateIsoFromPlanningHtml(c) ?? undefined,
      });
    };
  }, [enabled]);

  return { saveError };
}
