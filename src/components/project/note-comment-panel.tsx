"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createNoteComment,
  toggleNoteCommentUnderstood,
} from "@/actions/note-comment";

export type NoteCommentItem = {
  id: string;
  content: string;
  createdAt: Date | string;
  user: { id: string; name: string | null; imageUrl: string | null };
};

export type NoteCommentThreadView = {
  id: string;
  quoteText: string;
  conversationId: string | null;
  comments: NoteCommentItem[];
  understood: boolean;
};

export function NoteCommentPopover({
  thread,
  noteId,
  onClose,
  onChanged,
  hideChatLink = false,
  onViewNote,
  className,
}: {
  thread: NoteCommentThreadView;
  noteId: string;
  onClose: () => void;
  onChanged: () => void;
  hideChatLink?: boolean;
  onViewNote?: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState(false);
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

  async function toggleUnderstood() {
    setToggling(true);
    try {
      await toggleNoteCommentUnderstood(thread.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div
      className={cn(
        "flex w-[min(calc(100vw-2rem),320px)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl",
        className,
      )}
    >
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <p className="min-w-0 flex-1 line-clamp-3 border-s-2 border-amber-400/70 ps-2 text-xs italic leading-snug text-muted-foreground">
          {thread.quoteText}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title={thread.understood ? "Mark as not understood" : "Mark as understood"}
            onClick={() => void toggleUnderstood()}
            disabled={toggling}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors",
              thread.understood
                ? "bg-sky-500/20 text-sky-400"
                : "text-muted-foreground hover:bg-accent hover:text-sky-400",
            )}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!hideChatLink && thread.conversationId && (
        <div className="border-b border-border px-3 py-1.5">
          <Link
            href={`/dashboard/messages/conv-${thread.conversationId}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Open in chat →
          </Link>
        </div>
      )}
      {onViewNote && (
        <div className="border-b border-border px-3 py-1.5">
          <button
            type="button"
            onClick={onViewNote}
            className="text-xs font-medium text-primary hover:underline"
          >
            View full note
          </button>
        </div>
      )}

      <div
        className={cn(
          "space-y-3 overflow-y-auto px-3 py-3",
          hideChatLink ? "max-h-[min(50dvh,24rem)]" : "max-h-56",
        )}
      >
        {thread.comments.length === 0 ? (
          <p className="text-s text-muted-foreground">No comments yet.</p>
        ) : (
          thread.comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              {c.user.imageUrl ? (
                <img
                  src={c.user.imageUrl}
                  alt=""
                  className="size-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                  {(c.user.name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-s font-medium">
                    {c.user.name ?? "Someone"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-s leading-relaxed">
                  {c.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void reply();
            }
          }}
          placeholder="Reply…"
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-s outline-none focus:border-primary/40"
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => void reply()} disabled={submitting || !draft.trim()}>
            {submitting ? (
              <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="me-1 h-3.5 w-3.5" />
            )}
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
}
