"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { type NoteCommentPayload } from "@/lib/note-comment-payload";
import { ActivityCard } from "@/components/messages/activity-card";
import { NoteCommentReplyDialog } from "@/components/messages/note-comment-reply-dialog";

const COMMENT_THEME = {
  accent: "text-amber-400",
  border: "border-amber-500/35",
  ring: "ring-amber-500/20",
  iconWrap: "bg-amber-500/10 text-amber-400",
  button: "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400",
};

export function NoteCommentCard({
  payload,
  createdAt,
}: {
  payload: NoteCommentPayload;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActivityCard
        theme={COMMENT_THEME}
        icon={MessageSquareText}
        category="Note comment"
        title={payload.noteTitle}
        onAction={() => setOpen(true)}
        actionLabel="Reply on the highlight"
        createdAt={createdAt}
      >
        {payload.quoteText ? (
          <blockquote className="border-l-2 border-amber-400/60 pl-3 text-[12px] italic text-muted-foreground">
            {payload.quoteText}
          </blockquote>
        ) : null}
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
          {payload.comment}
        </p>
      </ActivityCard>
      <NoteCommentReplyDialog
        open={open}
        onOpenChange={setOpen}
        noteId={payload.noteId}
        threadId={payload.threadId}
        noteTitle={payload.noteTitle}
      />
    </>
  );
}
