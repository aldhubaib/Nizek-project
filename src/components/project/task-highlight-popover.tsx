"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createTaskHighlightComment,
  toggleTaskHighlightUnderstood,
} from "@/actions/task-highlight-comment";
import type { NoteCommentThreadView } from "@/components/project/note-comment-panel";

export type TaskHighlightThreadView = NoteCommentThreadView;

export function TaskHighlightPopover({
  thread,
  taskId,
  onClose,
  onChanged,
}: {
  thread: TaskHighlightThreadView;
  taskId: string;
  onClose: () => void;
  onChanged: () => void;
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
      await createTaskHighlightComment({
        taskId,
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
      await toggleTaskHighlightUnderstood(thread.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex w-[min(calc(100vw-2rem),320px)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
      <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <p className="min-w-0 flex-1 line-clamp-3 border-l-2 border-amber-400/70 pl-2 text-[11px] italic leading-snug text-muted-foreground">
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

      {thread.conversationId && (
        <div className="border-b border-border px-3 py-1.5">
          <Link
            href={`/dashboard/messages/conv-${thread.conversationId}`}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Open in chat →
          </Link>
        </div>
      )}

      <div className="max-h-56 space-y-3 overflow-y-auto px-3 py-3">
        {thread.comments.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No comments yet.</p>
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
                <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold">
                  {(c.user.name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
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
