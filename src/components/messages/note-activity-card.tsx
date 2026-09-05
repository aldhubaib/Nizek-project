"use client";

import { useState } from "react";
import {
  isSprintScopeCard,
  noteActivityCategory,
  type NoteActivityPayload,
  noteCardShowsExcerpt,
} from "@/lib/note-activity-payload";
import { ACTIVITY_ACTION_CLASS, ActivityCard } from "@/components/messages/activity-card";
import { activityTheme } from "@/components/messages/activity-themes";
import { NoteCommentReplyDialog } from "@/components/messages/note-comment-reply-dialog";
import { SprintDocSlideOver } from "@/components/messages/sprint-doc-slide-over";
import { ClientNoteSlideOver } from "@/components/messages/client-note-slide-over";
import { SprintApproveAction } from "@/components/messages/sprint-approve-action";
import { cn } from "@/lib/utils";

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  content: "content",
  date: "date",
  roadmapStatus: "status",
  dueDate: "due date",
  startedAt: "starting date",
  workingDays: "efforts",
};

export function NoteActivityCard({
  payload,
  createdAt,
  projectName,
  isClientViewer = false,
}: {
  payload: NoteActivityPayload;
  createdAt: string;
  projectName?: string;
  /** Clients get the read-only sprint document instead of the note workspace. */
  isClientViewer?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visual = activityTheme(payload.noteType);
  const changed = (payload.fields ?? [])
    .map((f) => FIELD_LABEL[f] ?? f)
    .filter(Boolean);
  const category = noteActivityCategory(payload);
  const title = payload.noteTitle.trim() || "Untitled";
  // A sprint card opens the live sprint document — the same one the road map
  // serves, for staff and clients alike, because the note workspace renders the
  // saved HTML and a sprint document is mostly not in it. Anything else opens
  // the note body on its own.
  const opensSprintDoc = Boolean(payload.sprintId);
  // Shipping a sprint is the client accepting the review, so the card that
  // delivers the review is where they accept it.
  const approvable = payload.noteType === "SPRINT_REVIEW" && payload.sprintId;
  // Where the review card puts the approval button. A scope change has nothing
  // to accept or decline — it has already happened — so the slot names the work
  // that moved, which is the only thing the reader wants from the card.
  const scopeTask = isSprintScopeCard(payload.noteType) ? payload.scopeTask : undefined;

  return (
    <>
      <ActivityCard
        theme={visual.theme}
        icon={visual.icon}
        category={category}
        title={title}
        projectName={payload.projectName || projectName}
        onAction={() => setOpen(true)}
        actionLabel="Open original note"
        footer={
          approvable ? (
            <SprintApproveAction sprintId={approvable} />
          ) : scopeTask ? (
            <div className={cn(ACTIVITY_ACTION_CLASS, visual.theme.button, "cursor-default")}>
              <visual.icon className="size-4 shrink-0" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate text-foreground">
                <span className="font-mono text-xs text-muted-foreground">{scopeTask.code}</span>{" "}
                {scopeTask.title}
              </span>
            </div>
          ) : undefined
        }
        createdAt={createdAt}
      >
        {/* Also checked here, not just where cards are written, so the sprint
            cards already sitting in the history stop quoting the boilerplate. */}
        {payload.excerpt && noteCardShowsExcerpt(payload.noteType) ? (
          <blockquote
            className={cn(
              "border-s-2 ps-3 text-s italic text-muted-foreground",
              visual.theme.quote ?? "border-primary/60",
            )}
          >
            {payload.excerpt}
          </blockquote>
        ) : null}
        {payload.action === "updated" && changed.length > 0 ? (
          <p className="whitespace-pre-wrap text-s leading-relaxed text-foreground">
            Changed {changed.join(", ")}
          </p>
        ) : null}
      </ActivityCard>
      {opensSprintDoc && open && payload.sprintId ? (
        <SprintDocSlideOver
          projectId={payload.projectId}
          sprintId={payload.sprintId}
          title={title}
          isClientViewer={isClientViewer}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {isClientViewer && !opensSprintDoc && open ? (
        <ClientNoteSlideOver
          projectId={payload.projectId}
          noteId={payload.noteId}
          title={title}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {isClientViewer || opensSprintDoc ? null : (
        <NoteCommentReplyDialog
          open={open}
          onOpenChange={setOpen}
          noteId={payload.noteId}
          noteTitle={title}
          projectId={payload.projectId}
        />
      )}
    </>
  );
}
