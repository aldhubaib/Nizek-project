"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { getClientNoteDoc } from "@/actions/client-note";

/**
 * A client's copy of an ordinary note, opened from the card in their chat.
 *
 * The sprint documents have their own viewer because they are assembled from
 * live sprint data. Everything else is just the body somebody wrote, read-only:
 * no comment threads, no linked tasks, no edit history, because none of that is
 * fetched.
 */
export function ClientNoteSlideOver({
  projectId,
  noteId,
  title,
  onClose,
}: {
  projectId: string;
  noteId: string;
  /** From the chat card, so the header has something before the body lands. */
  title: string;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<{ title: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getClientNoteDoc({ projectId, noteId })
      .then((d) => live && setDoc(d))
      .catch((e) =>
        live && setError(e instanceof Error ? e.message : "Could not open that note"),
      );
    return () => {
      live = false;
    };
  }, [projectId, noteId]);

  return (
    <NoteSlideOver title={doc?.title || title} onClose={onClose}>
      <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
        {error ? (
          <p className="py-10 text-center text-s text-destructive">{error}</p>
        ) : !doc ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <RichTextEditor
            content={doc.content}
            onChange={() => {}}
            editable={false}
            borderless
          />
        )}
      </div>
    </NoteSlideOver>
  );
}
