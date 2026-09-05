"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createMeetingNote, getMeetingNote, getOrCreateSprintDocNote, getSprintDocNote } from "@/actions/meeting-note";
import {
  getSprintPlanningTasks,
  getSprintProofOfWork,
  getSprintReviewTasks,
} from "@/actions/sprint";
import { loadSprintDocTasks } from "@/lib/sprint-doc-tasks";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { PageHeaderActions } from "@/components/page-header-actions";
import { useNoteAutosave } from "@/components/project/use-note-autosave";
import { cn } from "@/lib/utils";
import { SprintDocDashboard } from "@/components/project/sprint-doc-dashboard";
import { NOTE_TYPE_CONFIG, type NoteType } from "@/components/project/note-types";
import {
  blankPlanningSchedule,
  documentDateIsoFromPlanningHtml,
  overlayPlanningTaskAssignees,
  syncPlanningDocTasks,
  type SprintPlanningTask,
  type SprintTaskProof,
} from "@/lib/sprint-planning-doc";
import {
  foldSprintItemList,
  sprintCardCarryFromHtml,
  sprintDocHtml,
  sprintDocName,
  sprintScopeChanges,
  syncSprintDocOutcome,
  withSprintReviewDate,
  type SprintRemovedTask,
} from "@/lib/sprint-doc";
import { SprintRemovedPanel } from "@/components/project/sprint-scope-changes";
import { isClosedSprint, isUnstartedSprint } from "@/lib/sprint-status";
import { canEditSprintDoc as canEditSprintDocFor } from "@/lib/sprint-doc-access";
import { useCollaboration } from "@/components/realtime/use-collaboration";
import { useChannel } from "@/components/realtime/hooks";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { projectChannel } from "@/lib/channels";

export { NOTES_CREATE_TYPES, type NoteType } from "@/components/project/note-types";

export function NoteFullScreenCreate({
  projectId,
  onCreated,
  createTypes,
  taskId,
  initialTitle = "",
  sprintId,
  sprintStatus: initialSprintStatus,
  isAdmin = false,
  canStartSprint = false,
  canEndSprint = false,
  canCreateSprintPlanning = false,
  canEditSprintDoc,
  hideAssignees = false,
  onCancel,
  saveInHeader = true,
  autoFocusTitle = true,
  currentUser,
}: {
  projectId: string;
  onCreated: (note: Awaited<ReturnType<typeof getMeetingNote>>) => void;
  createTypes: NoteType[];
  /** When set, the new note is linked to this task. */
  taskId?: string;
  initialTitle?: string;
  /** When set, the editor is prefilled with this sprint's tasks and `/` lists them. */
  sprintId?: string;
  sprintStatus?: string;
  isAdmin?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  canCreateSprintPlanning?: boolean;
  /** Only for callers that already know the answer; otherwise it is derived. */
  canEditSprintDoc?: boolean;
  /** Hide assignees in planning/review task rows (client view). */
  hideAssignees?: boolean;
  onCancel?: () => void;
  /** Portal Save into the shell header. Turn off when this form sits under an overlay that covers that slot. */
  saveInHeader?: boolean;
  /** Turn off when two documents share a view, so neither grabs the caret. */
  autoFocusTitle?: boolean;
  currentUser?: { id: string; name: string | null; imageUrl: string | null } | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState("");
  const [sprintTasks, setSprintTasks] = useState<SprintPlanningTask[]>([]);
  // Why each departed task left. Not on the tasks themselves: a departed task
  // is read out of the frozen plan, which predates it leaving.
  const [removed, setRemoved] = useState<SprintRemovedTask[]>([]);
  const [sprintProof, setSprintProof] = useState<Record<string, SprintTaskProof>>({});
  const [sprintReady, setSprintReady] = useState(!sprintId);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [noteType, setNoteType] = useState<NoteType | null>(createTypes.length === 1 ? createTypes[0] : null);
  const [sprintStatus, setSprintStatus] = useState(initialSprintStatus ?? "");
  const [saving, setSaving] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    if (initialSprintStatus) setSprintStatus(initialSprintStatus);
  }, [initialSprintStatus]);

  const isDeadline = noteType === "DEADLINE";
  const isSprintDoc = noteType === "SPRINT_DOC";
  // Before the sprint starts the plan is being written; after it closes there
  // is nothing left to write. In between, the outcome half is what moves, and
  // the plan half locks itself through the editor's own task blocks.
  const sprintClosed = isSprintDoc && isClosedSprint(sprintStatus);
  // Derived from the live status rather than taken from the caller, so the
  // document grants the same rights wherever it is opened. Ordinary notes are
  // written by whoever opened the form, which is the only reason this asks
  // whether it is a sprint document at all.
  const docWritable =
    !isSprintDoc ||
    (canEditSprintDoc ??
      canEditSprintDocFor(
        {
          isAdmin,
          canCreateSprintPlanning,
          canStartSprint,
          canEndSprint,
          isClient: hideAssignees,
        },
        sprintStatus,
      ));
  const readOnly = hideAssignees || !docWritable;
  const planningLocked = (sprintClosed && !isAdmin) || readOnly;

  const { ydoc, provider: collabProvider, synced: collabSynced, enabled: collabEnabled } =
    // Read-only viewers join too. They cannot type, so they push nothing, but
    // joining is the difference between watching the sprint being planned and
    // staring at whatever HTML happened to be saved when they opened it.
    useCollaboration(isSprintDoc && noteId ? noteId : null);

  const { saveError: autoSaveError } = useNoteAutosave({
    noteId,
    title,
    content,
    enabled: isSprintDoc && !planningLocked,
    persistContent: !collabEnabled && !planningLocked,
  });
  const planningError = saveError ?? autoSaveError;

  // One document per sprint, loaded once. Which half of it is live depends on
  // the sprint: before it starts there is only the plan, and the plan follows
  // the sprint's task list; after it starts the plan is a record and the
  // outcome half is the part that moves.
  useEffect(() => {
    if (!sprintId || !isSprintDoc) return;
    let cancelled = false;
    (async () => {
      try {
        const [existing, planning] = await Promise.all([
          getSprintDocNote(projectId, sprintId),
          getSprintPlanningTasks(sprintId),
        ]);
        if (cancelled) return;
        setSprintStatus(planning.status);
        const docTitle = sprintDocName(
          existing?.title || initialTitle || planning.sprintName,
        );

        if (isUnstartedSprint(planning.status)) {
          setSprintTasks(planning.tasks);
          if (existing) {
            setNoteId(existing.id);
            setTitle(existing.title);
            setContent(syncPlanningDocTasks(existing.content, planning.tasks));
            return;
          }
          const html = sprintDocHtml(planning.tasks, blankPlanningSchedule(planning.info));
          setContent(html);
          setTitle(docTitle);
          if (readOnly) return;
          const doc = await getOrCreateSprintDocNote({
            projectId,
            sprintId,
            title: docTitle,
            content: html,
            date: new Date().toISOString().slice(0, 10),
          });
          if (cancelled) return;
          setNoteId(doc.id);
          // Someone else created it first; theirs is the one being edited.
          if (!doc.created) {
            setTitle(doc.title);
            setContent(syncPlanningDocTasks(doc.content, planning.tasks));
            return;
          }
          const full = await getMeetingNote(doc.id);
          if (!cancelled) onCreatedRef.current(full);
          return;
        }

        const [review, proof] = await Promise.all([
          getSprintReviewTasks(sprintId),
          getSprintProofOfWork(sprintId),
        ]);
        if (cancelled) return;
        const allTasks = [...review.completed, ...review.incomplete];
        setSprintTasks(allTasks);
        setRemoved(review.removed);
        setSprintProof(proof);

        if (existing) {
          setNoteId(existing.id);
          setTitle(existing.title);
          // Closed: the outcome is signed off, so it is read back rather than
          // rebuilt. Assignees are overlaid because the saved copy carries none
          // for a client and the staff copy can be stale. The fold is safe on a
          // record because the tasks it removes are the ones printed below it.
          if (isClosedSprint(review.status)) {
            setContent(
              overlayPlanningTaskAssignees(foldSprintItemList(existing.content), allTasks),
            );
            return;
          }
          const carry = sprintCardCarryFromHtml(existing.content);
          const dated = withSprintReviewDate(existing.content, review.info.documentDateIso);
          setContent(
            overlayPlanningTaskAssignees(
              syncSprintDocOutcome(dated, review.completed, review.incomplete, carry),
              allTasks,
            ),
          );
          return;
        }

        // A sprint running without a document — nobody opened it while it was
        // being planned. Both halves are written from where the sprint is now.
        const plan = sprintDocHtml(allTasks, { ...review.info, locked: true });
        const html = overlayPlanningTaskAssignees(
          syncSprintDocOutcome(
            withSprintReviewDate(plan, review.info.documentDateIso),
            review.completed,
            review.incomplete,
          ),
          allTasks,
        );
        setContent(html);
        setTitle(docTitle);
        if (readOnly) return;
        const doc = await getOrCreateSprintDocNote({
          projectId,
          sprintId,
          title: docTitle,
          content: html,
          date: review.info.documentDateIso,
        });
        if (cancelled) return;
        setNoteId(doc.id);
        if (!doc.created) {
          setTitle(doc.title);
          setContent(overlayPlanningTaskAssignees(doc.content, allTasks));
          return;
        }
        const full = await getMeetingNote(doc.id);
        if (!cancelled) onCreatedRef.current(full);
      } catch (err) {
        if (!cancelled) {
          setSaveError(err instanceof Error ? err.message : "Could not save");
        }
      } finally {
        if (!cancelled) setSprintReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sprintId, projectId, initialTitle, isSprintDoc, readOnly]);

  // A closed sprint is served from its snapshots, and the live task list no
  // longer describes it — half those tasks have been sent back to the backlog.
  // So the document only keeps following the sprint while it is still open.
  const sprintDocLive = isSprintDoc && !sprintClosed;

  useEffect(() => {
    if (!sprintId || !sprintDocLive) return;
    const id = sprintId;
    let cancelled = false;
    function refresh() {
      loadSprintDocTasks(id)
        .then((data) => {
          if (cancelled) return;
          setSprintStatus(data.status);
          setSprintTasks(data.tasks);
          setRemoved(data.removed);
          setSprintProof(data.proof);
        })
        .catch(() => {});
    }
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [sprintId, sprintDocLive]);

  const sprintTasksLoadRef = useRef<(() => void) | undefined>(undefined);
  sprintTasksLoadRef.current = () => {
    if (!sprintId || !sprintDocLive) return;
    loadSprintDocTasks(sprintId)
      .then((data) => {
        setSprintStatus(data.status);
        setSprintTasks(data.tasks);
        setRemoved(data.removed);
        setSprintProof(data.proof);
      })
      .catch(() => {});
  };
  const cent = useCentrifugo();
  useChannel(
    cent?.enabled && sprintDocLive ? projectChannel(projectId) : null,
    useCallback((data: unknown) => {
      const ev = data as { type?: string } | null;
      if (!ev?.type) return;
      if (ev.type.startsWith("sprint.") || ev.type === "task-updated") {
        sprintTasksLoadRef.current?.();
      }
    }, []),
  );

  // The document stops following the sprint at start, so from then on the two
  // can disagree — and that disagreement is what the outcome reports.
  const showScopeChanges =
    isSprintDoc && Boolean(sprintId) && sprintReady && !isUnstartedSprint(sprintStatus);
  // Once the sprint closes the departures are written into the document, so the
  // panel would be printing the section that is already on the page above it.
  const showRemovedPanel = showScopeChanges && !sprintClosed;
  const addedCount = useMemo(
    () => (showScopeChanges ? sprintScopeChanges(content, sprintTasks).added.length : 0),
    [showScopeChanges, content, sprintTasks],
  );

  async function handleSave() {
    if (!noteType) { setTypeError(true); return; }
    // Documents predating the merge still carry these; nothing creates them.
    if (noteType === "SPRINT_PLANNING" || noteType === "SPRINT_REVIEW") return;
    if (!title.trim()) return;
    setTypeError(false);
    setSaveError(null);
    setSaving(true);
    try {
      const created = await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date: (isSprintDoc && documentDateIsoFromPlanningHtml(content)) || date,
        noteType,
        ...(taskId ? { taskId } : {}),
        ...(isDeadline ? { roadmapStatus: "PLANNED" } : {}),
      });
      const full = await getMeetingNote(created.id);
      onCreated(full);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const placeholders: Record<string, string> = {
    DECISION: "What was decided?",
    CLARIFICATION: "What needs clarifying?",
    DEADLINE: "Title...",
    MEETING_NOTE: "Meeting title...",
    SPRINT_DOC: "Sprint document title...",
  };

  const editorPlaceholders: Record<string, string> = {
    DECISION: "Describe the context, options considered, and rationale... (type / for commands)",
    CLARIFICATION: "Capture the questions, missing details, and what was clarified... (type / for commands)",
    DEADLINE: "Notes about this item... (type / for commands)",
    MEETING_NOTE: "Write your meeting notes here... (type / for commands)",
    SPRINT_DOC: "Type / to insert a sprint task...",
  };

  const saveButton = (
    <div className="flex items-center gap-2">
      {onCancel && (
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      )}
      <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col bg-background">
      {!isSprintDoc && (saveInHeader ? <PageHeaderActions>{saveButton}</PageHeaderActions> : (
        <div className="flex justify-end px-app pt-4">{saveButton}</div>
      ))}

      <div className="max-w-4xl mx-auto w-full px-app py-6 sm:py-10 lg:px-16">
          {createTypes.length === 1 && noteType && !isSprintDoc ? (
            <LockedNoteTypeBadge noteType={noteType} />
          ) : null}

          {createTypes.length > 1 && (
          <div className="mb-6">
            <div className="flex gap-2 flex-wrap">
              {createTypes.map((id) => {
                const cfg = NOTE_TYPE_CONFIG[id];
                const Icon = cfg.icon;
                const isActive = noteType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setNoteType(id); setTypeError(false); }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2 text-s font-medium transition-colors",
                      isActive ? `${cfg.bg} ${cfg.color}` : "border-border text-muted-foreground hover:border-muted-foreground/40",
                      typeError && !isActive && "border-destructive/40"
                    )}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            {typeError && <p className="text-xs text-destructive mt-1.5">Please select a type</p>}
          </div>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={planningLocked}
            placeholder={placeholders[noteType ?? "MEETING_NOTE"] ?? "Title..."}
            className={cn(
              "w-full bg-transparent border-none outline-none placeholder:text-muted-foreground/30",
              isSprintDoc
                ? "mb-10 text-center text-4xl font-bold leading-tight"
                : "mb-4 text-m font-bold",
              planningLocked && "pointer-events-none",
            )}
            autoFocus={autoFocusTitle && !planningLocked}
          />

          {isSprintDoc ? (
            <SprintDocDashboard
              tasks={sprintTasks}
              review={showScopeChanges}
              added={addedCount}
              removed={removed.length}
            />
          ) : null}

          {isDeadline ? (
            <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border/50">
              {saveError ? (
                <p className="text-xs text-destructive">{saveError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  New items start in Planned. Open the item to change its status.
                </p>
              )}
            </div>
          ) : isSprintDoc ? (
            planningError ? (
              <p className="mb-8 text-xs text-destructive">{planningError}</p>
            ) : planningLocked && !hideAssignees ? (
              <p className="mb-8 text-center text-xs text-muted-foreground">
                This sprint document is locked. Only an admin can edit it once the sprint closes.
              </p>
            ) : null
          ) : null}

          {sprintId && !sprintReady ? (
            <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder={editorPlaceholders[noteType ?? "MEETING_NOTE"] ?? "Write here... (type / for commands)"}
              borderless
              editable={!planningLocked}
              isAdmin={isAdmin}
              canStartSprint={canStartSprint}
              canEndSprint={canEndSprint}
              hideAssignees={hideAssignees}
              projectId={projectId}
              sprintId={sprintId}
              sprintStatus={sprintStatus}
              sprintTasks={sprintTasks}
              sprintProof={sprintProof}
              onSprintStatusChange={setSprintStatus}
              ydoc={ydoc}
              collabProvider={collabProvider}
              collabSynced={collabSynced}
              currentUser={currentUser}
              onSprintTaskPatch={(taskId, patch) => {
                setSprintTasks((prev) =>
                  prev.map((item) => (item.id === taskId ? { ...item, ...patch } : item)),
                );
              }}
            />
          )}

          {showRemovedPanel ? (
            <SprintRemovedPanel removed={removed} hideAssignees={hideAssignees} />
          ) : null}
      </div>
    </div>
  );
}

function LockedNoteTypeBadge({ noteType }: { noteType: NoteType }) {
  const cfg = NOTE_TYPE_CONFIG[noteType];
  const Icon = cfg.icon;
  return (
    <div className="mb-6">
      <span className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-s font-medium", cfg.bg, cfg.color)}>
        <Icon className="w-4 h-4" strokeWidth={1.5} />
        {cfg.label}
      </span>
    </div>
  );
}
