"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { type NoteCommentPayload } from "@/lib/note-comment-payload";
import { ActivityCard } from "@/components/messages/activity-card";
import { NoteCommentReplyDialog } from "@/components/messages/note-comment-reply-dialog";

const COMMENT_THEME = {
  accent: "text-orange",
  border: "border-orange/35",
  ring: "ring-orange/20",
  iconWrap: "bg-orange/10 text-orange",
  button: "border-orange/30 bg-orange/5 hover:bg-orange/10 text-orange",
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
          <blockquote className="border-s-2 border-orange/60 ps-3 text-s italic text-muted-foreground">
            {payload.quoteText}
          </blockquote>
        ) : null}
        <p className="whitespace-pre-wrap text-s leading-relaxed text-foreground">
          {payload.comment}
        </p>
      </ActivityCard>
      <NoteCommentReplyDialog
        open={open}
        onOpenChange={setOpen}
        noteId={payload.noteId}
        threadId={payload.threadId}
        noteTitle={payload.noteTitle}
        projectId={payload.projectId}
      />
    </>
  );
}
