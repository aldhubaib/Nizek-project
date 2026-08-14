"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getNoteCommentThread } from "@/actions/note-comment";
import {
  NoteCommentPopover,
  type NoteCommentThreadView,
} from "@/components/project/note-comment-panel";

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
  threadId: string;
  noteTitle: string;
}) {
  const [thread, setThread] = useState<NoteCommentThreadView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Reply on “{noteTitle}”</DialogTitle>
          <DialogDescription>Comment thread on this note highlight.</DialogDescription>
        </DialogHeader>
        {loading && !thread ? (
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
            className="w-full max-w-none rounded-none border-0 shadow-none"
            onClose={() => onOpenChange(false)}
            onChanged={() => void load()}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
