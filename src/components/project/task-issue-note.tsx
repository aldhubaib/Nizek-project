"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getOrCreateTaskNote } from "@/actions/meeting-note";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { useNoteAutosave } from "@/components/project/use-note-autosave";
import { PageBody } from "@/components/page-body";

export function TaskIssueNote({
  taskId,
  fallbackTitle,
}: {
  taskId: string;
  fallbackTitle: string;
}) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState(fallbackTitle);
  const [content, setContent] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrCreateTaskNote(taskId)
      .then((note) => {
        if (cancelled) return;
        setNoteId(note.id);
        setTitle(note.title.trim() || fallbackTitle);
        setContent(note.content ?? "");
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open note");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, fallbackTitle]);

  const { saveError } = useNoteAutosave({
    noteId,
    title,
    content,
    enabled: ready && Boolean(noteId),
  });

  if (error) {
    return (
      <p className="px-app py-10 text-center text-s text-destructive">{error}</p>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background">
      <PageBody className="mx-auto w-full max-w-4xl py-6 sm:py-10">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title..."
          className="mb-4 w-full border-none bg-transparent text-m font-bold outline-none placeholder:text-muted-foreground/30"
        />
        {saveError ? (
          <p className="mb-4 text-xs text-destructive">{saveError}</p>
        ) : null}
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder="Describe the issue… (type / for commands)"
          borderless
        />
      </PageBody>
    </div>
  );
}
