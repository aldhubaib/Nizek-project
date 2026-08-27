"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createMeetingNote, getMeetingNote, getSprintPlanningNote, getSprintReviewNote } from "@/actions/meeting-note";
import { getSprintPlanningTasks, getSprintReviewTasks } from "@/actions/sprint";
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
  sprintPlanningDocHtml,
  sprintPlanningIsLocked,
  syncPlanningDocTasks,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";
import {
  incompleteReasonsFromReviewHtml,
  reviewInfoFromExisting,
  sprintReviewDocHtml,
} from "@/lib/sprint-review-doc";
import { isClosedSprint } from "@/lib/sprint-status";
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
  canEditSprintDoc,
  onCancel,
  saveInHeader = true,
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
  canEditSprintDoc?: boolean;
  onCancel?: () => void;
  /** Portal Save into the shell header. Turn off when this form sits under an overlay that covers that slot. */
  saveInHeader?: boolean;
  currentUser?: { id: string; name: string | null; imageUrl: string | null } | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState("");
  const [sprintTasks, setSprintTasks] = useState<SprintPlanningTask[]>([]);
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
  const isSprintPlanning = noteType === "SPRINT_PLANNING";
  const isSprintReview = noteType === "SPRINT_REVIEW";
  const isSprintDoc = isSprintPlanning || isSprintReview;
  const planningLocked =
    (sprintPlanningIsLocked(sprintStatus, isAdmin) && isSprintPlanning) ||
    (isSprintDoc && canEditSprintDoc === false);

  const { ydoc, provider: collabProvider, synced: collabSynced, enabled: collabEnabled } =
    useCollaboration(isSprintDoc && noteId ? noteId : null);

  const { saveError: autoSaveError } = useNoteAutosave({
    noteId,
    title,
    content,
    enabled: isSprintDoc && !planningLocked && !collabEnabled,
  });
  const planningError = saveError ?? autoSaveError;

  useEffect(() => {
    if (!sprintId || !isSprintDoc) return;
    let cancelled = false;
    (async () => {
      try {
        if (isSprintReview) {
          const [existing, review] = await Promise.all([
            getSprintReviewNote(projectId, sprintId),
            getSprintReviewTasks(sprintId),
          ]);
          if (cancelled) return;
          const allTasks = [...review.completed, ...review.incomplete];
          setSprintTasks(allTasks);

          if (existing && isClosedSprint(review.status)) {
            setNoteId(existing.id);
            setTitle(existing.title);
            setContent(overlayPlanningTaskAssignees(existing.content, allTasks));
            return;
          }

          const reasons = existing ? incompleteReasonsFromReviewHtml(existing.content) : {};
          const info = existing
            ? reviewInfoFromExisting(review.info, existing.content)
            : { ...review.info, variant: "review" as const, locked: true };
          const html = overlayPlanningTaskAssignees(
            sprintReviewDocHtml(info, review.completed, review.incomplete, reasons),
            allTasks,
          );

          if (existing) {
            setNoteId(existing.id);
            setTitle(existing.title);
            setContent(html);
            return;
          }

          setContent(html);
          setTitle(initialTitle || `${review.sprintName} review`);
          const created = await createMeetingNote({
            projectId,
            title: (initialTitle || `${review.sprintName} review`).trim(),
            content: html,
            date: info.documentDateIso,
            noteType: "SPRINT_REVIEW",
          });
          if (cancelled) return;
          setNoteId(created.id);
          const full = await getMeetingNote(created.id);
          if (!cancelled) onCreatedRef.current(full);
          return;
        }

        const [existing, planning] = await Promise.all([
          getSprintPlanningNote(projectId, sprintId),
          getSprintPlanningTasks(sprintId),
        ]);
        if (cancelled) return;
        setSprintStatus(planning.status);
        setSprintTasks(planning.tasks);
        if (existing) {
          setNoteId(existing.id);
          setTitle(existing.title);
          setContent(syncPlanningDocTasks(existing.content, planning.tasks));
          return;
        }
        const info = blankPlanningSchedule(planning.info);
        const html = sprintPlanningDocHtml(planning.tasks, info);
        setContent(html);
        setTitle(initialTitle || `${planning.sprintName} planning`);
        const created = await createMeetingNote({
          projectId,
          title: (initialTitle || `${planning.sprintName} planning`).trim(),
          content: html,
          date: new Date().toISOString().slice(0, 10),
          noteType: "SPRINT_PLANNING",
        });
        if (cancelled) return;
        setNoteId(created.id);
        const full = await getMeetingNote(created.id);
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
  }, [sprintId, projectId, initialTitle, isSprintDoc, isSprintReview]);

  useEffect(() => {
    if (!sprintId || !isSprintPlanning) return;
    const id = sprintId;
    let cancelled = false;
    function refresh() {
      getSprintPlanningTasks(id)
        .then((data) => {
          if (cancelled) return;
          setSprintStatus(data.status);
          setSprintTasks(data.tasks);
        })
        .catch(() => {});
    }
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [sprintId, isSprintPlanning]);

  const sprintTasksLoadRef = useRef<(() => void) | undefined>(undefined);
  sprintTasksLoadRef.current = () => {
    if (!sprintId || !isSprintPlanning) return;
    getSprintPlanningTasks(sprintId)
      .then((data) => {
        setSprintStatus(data.status);
        setSprintTasks(data.tasks);
      })
      .catch(() => {});
  };
  const cent = useCentrifugo();
  useChannel(
    cent?.enabled && isSprintPlanning ? projectChannel(projectId) : null,
    useCallback((data: unknown) => {
      const ev = data as { type?: string } | null;
      if (!ev?.type) return;
      if (ev.type.startsWith("sprint.") || ev.type === "task-updated") {
        sprintTasksLoadRef.current?.();
      }
    }, []),
  );

  async function handleSave() {
    if (!noteType) { setTypeError(true); return; }
    if (!title.trim()) return;
    setTypeError(false);
    setSaveError(null);
    setSaving(true);
    try {
      const created = await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date: (isSprintPlanning && documentDateIsoFromPlanningHtml(content)) || date,
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
    SPRINT_PLANNING: "Sprint planning title...",
    SPRINT_REVIEW: "Sprint review title...",
  };

  const editorPlaceholders: Record<string, string> = {
    DECISION: "Describe the context, options considered, and rationale... (type / for commands)",
    CLARIFICATION: "Capture the questions, missing details, and what was clarified... (type / for commands)",
    DEADLINE: "Notes about this item... (type / for commands)",
    MEETING_NOTE: "Write your meeting notes here... (type / for commands)",
    SPRINT_PLANNING: "Type / to insert a sprint task...",
    SPRINT_REVIEW: "Write the sprint review... (type / for commands)",
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
            autoFocus={!planningLocked}
          />

          {isSprintDoc ? <SprintDocDashboard tasks={sprintTasks} review={isSprintReview} /> : null}

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
            ) : planningLocked ? (
              <p className="mb-8 text-center text-xs text-muted-foreground">
                This planning document is locked. Only an admin can edit it after the sprint starts.
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
              projectId={projectId}
              sprintTasks={sprintTasks}
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
