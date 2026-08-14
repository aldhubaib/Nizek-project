"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createNoteComment } from "@/actions/note-comment";

type Comment = {
  id: string;
  content: string;
  createdAt: Date | string;
  user: { id: string; name: string | null; imageUrl: string | null };
};

type Thread = {
  id: string;
  quoteText: string;
  conversationId: string | null;
  comments: Comment[];
};

export function NoteCommentPanel({
  thread,
  noteId,
  onClose,
  onChanged,
}: {
  thread: Thread;
  noteId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reply() {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createNoteComment({
        noteId,
        quoteText: thread.quoteText,
        threadId: thread.id,
        content: text,
      });
      setDraft("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reply");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 shrink-0 text-amber-400" />
          <h3 className="truncate text-sm font-semibold">Comments</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border px-4 py-3">
        <p className="line-clamp-4 border-l-2 border-amber-400/70 pl-2 text-[12px] italic text-muted-foreground">
          {thread.quoteText}
        </p>
        {thread.conversationId && (
          <Link
            href={`/dashboard/messages/conv-${thread.conversationId}`}
            className="mt-2 inline-block text-[11px] font-medium text-primary hover:underline"
          >
            Open in chat →
          </Link>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {thread.comments.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No replies yet.</p>
        ) : (
          thread.comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold">
                {(c.user.name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[12px] font-medium">
                    {c.user.name ?? "Someone"}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                  {c.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void reply();
            }
          }}
          placeholder="Reply… @ to mention. Recipients stay on this thread."
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-[13px] outline-none focus:border-primary/40"
        />
        {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => void reply()} disabled={submitting || !draft.trim()}>
            {submitting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
}
