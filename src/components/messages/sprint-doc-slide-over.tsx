"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NoteFullScreenCreate } from "@/components/project/note-full-screen-create";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { getSprintDocRights } from "@/actions/sprint";
import { NO_SPRINT_DOC_RIGHTS, type SprintDocRights } from "@/lib/sprint-doc-access";

/**
 * A sprint document opened from a card in chat.
 *
 * The same document the road map serves, on purpose: it is assembled from live
 * sprint data — the outcome, the proof behind each delivered task, what came and
 * went after the sprint started — none of which is in the saved HTML that the
 * ordinary note workspace would render. Chat is another door into the one
 * document, not a second version of it.
 *
 * A client's copy differs only in hiding who is assigned to what.
 */
export function SprintDocSlideOver({
  projectId,
  sprintId,
  title,
  isClientViewer,
  onClose,
}: {
  projectId: string;
  sprintId: string;
  /** From the chat card, so the header has something before the sprint lands. */
  title: string;
  isClientViewer: boolean;
  onClose: () => void;
}) {
  // A client never writes to the document, so their copy opens without waiting
  // to be told as much.
  const [rights, setRights] = useState<SprintDocRights | null>(
    isClientViewer ? { ...NO_SPRINT_DOC_RIGHTS, isClient: true } : null,
  );

  useEffect(() => {
    if (isClientViewer) return;
    let live = true;
    getSprintDocRights(sprintId)
      .then((r) => live && setRights(r))
      // Reading the document is what the card promised; losing the answer to
      // what this person may change is no reason to withhold it.
      .catch(() => live && setRights(NO_SPRINT_DOC_RIGHTS));
    return () => {
      live = false;
    };
  }, [sprintId, isClientViewer]);

  return (
    <NoteSlideOver title={title} onClose={onClose}>
      {!rights ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <NoteFullScreenCreate
          key={sprintId}
          projectId={projectId}
          // The card that opened this says "planning" or "review"; both are the
          // sprint's one document, seen at different points in its life.
          createTypes={["SPRINT_DOC"]}
          initialTitle={title}
          sprintId={sprintId}
          isAdmin={rights.isAdmin}
          canStartSprint={rights.canStartSprint}
          canEndSprint={rights.canEndSprint}
          canCreateSprintPlanning={rights.canCreateSprintPlanning}
          hideAssignees={rights.isClient}
          autoFocusTitle={false}
          onCancel={onClose}
          saveInHeader={false}
          onCreated={() => {}}
        />
      )}
    </NoteSlideOver>
  );
}
