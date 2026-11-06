"use client";

import * as React from "react";
import { Check, Flag, Pencil, Play, Trash2 } from "lucide-react";

import { sprintReviewVideoRequired } from "@/lib/proof-video-mode";
import { ADDED_BLURB, ADDED_HEADING, COMMITTED_BLURB, COMMITTED_HEADING, COMPLETED_SUBHEADING, INCOMPLETE_SUBHEADING, REMOVED_BLURB, REMOVED_HEADING, sprintDocName } from "@/lib/sprint-doc";
import { EMPTY_SPRINT_TASKS_TEXT, formatPlanningDate, SPRINT_INTRO_BLURB, SPRINT_INTRO_HEADING, SPRINT_ITEMS_BLURB, SPRINT_ITEMS_HEADING, type SprintPlanningInfo, type SprintPlanningTask } from "@/lib/sprint-planning-doc";
import { isClosedSprint, isUnstartedSprint } from "@/lib/sprint-status";
import { countWorkingDays, endDateForWorkingDays } from "@/lib/working-days";
import { HeaderCardSkeleton } from "@/next-ui/blocks";
import { formatFileSize } from "@/next-ui/blocks/format";
import { useProject, type ProjectDetail } from "@/next-ui/data/projects";
import {
  useAddSprintReviewVideos,
  useEndSprint,
  useRemoveSprintReviewVideo,
  useSprintDoc,
  useSprintPlan,
  useSprintProof,
  useSprintReview,
  useSprints,
  useStartSprint,
  useUpdateSprintDocInfo,
  type SprintReviewVideoDTO,
} from "@/next-ui/data/sprints";
import { uploadAttachments } from "@/next-ui/data/tasks";
import { cn } from "@/next-ui/lib/cn";
import { useViewer } from "@/next-ui/lib/viewer";
import { splitChildId, usePane } from "@/next-ui/panes";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { ConfirmDialog, ErrorNote, errorText, FilePicker, type PickedFile } from "@/next-ui/patterns/form-bits";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { RingAction } from "@/next-ui/patterns/ring-action";
import { Button } from "@/next-ui/ui/button";
import { Skeleton } from "@/next-ui/ui/skeleton";

import { viewerRights } from "./project-screen";
import { DocHeading, DocParagraph, DocSubheading, SprintMissing, SprintRemovedPanel, SprintSummary, SprintTaskCard, type Person } from "./sprint-doc-cards";
import { dayOf, endGaps, groupOutcome, infoToShow, reasonsToSend, requiredFieldCount, sprintSpanText, startGaps } from "./sprint-doc-state";

/**
 * A sprint's document, laid out as the live panel's: the sprint's name, the summary tiles,
 * then "Sprint Information" (plan date, review date once it has run, the review video where the
 * project asks for one, start, end, working days), the introduction, and the tasks as cards —
 * the plan's list while the sprint is planned (estimate, person, the questions and answers,
 * Decision and Risk), the outcome once it runs (committed and added work, each completed or not,
 * with the proof, what was delivered, the reason it was not). The header's one button starts the
 * sprint when the plan is complete and ends it when the review is: a ring around it fills as the
 * required fields do and turns green when nothing is missing; pressed before that, it goes to
 * the list of what is. Everything typed saves into the same document the live panel shows.
 */
export function SprintScreen({ id }: { id: string }) {
  const ids = splitChildId(id);
  const projectId = ids?.parent ?? "";
  const sprintId = ids?.child ?? "";
  const pane = usePane();
  const viewer = useViewer();
  const project = useProject(projectId);
  const rights = React.useMemo(() => viewerRights(project.data ?? { members: [], contracts: [] }, viewer?.id, viewer?.systemRole), [project.data, viewer?.id, viewer?.systemRole]);
  const sprints = useSprints(projectId);
  const sprintRow = sprints.data?.find((s) => s.id === sprintId) ?? null;
  const plan = useSprintPlan(sprintId);
  const status = plan.data?.status ?? sprintRow?.status ?? "";
  const started = status !== "" && !isUnstartedSprint(status);
  const closed = isClosedSprint(status);
  const review = useSprintReview(sprintId, started);
  const proof = useSprintProof(sprintId, started);
  const doc = useSprintDoc(sprintId);
  const start = useStartSprint(projectId);
  const end = useEndSprint(projectId);
  const updateInfo = useUpdateSprintDocInfo(projectId, sprintId);

  const [notice, setNotice] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<null | "start" | "end">(null);
  const [editingDates, setEditingDates] = React.useState(false);
  const [reasonDrafts, setReasonDrafts] = React.useState<Record<string, string>>({});
  const missingRef = React.useRef<HTMLDivElement>(null);

  // the Sprint Information rows: the document's, as a draft that is typed over and saved row by row
  const serverInfo = React.useMemo(() => infoToShow(doc.data?.info, plan.data?.info, status), [doc.data?.info, plan.data?.info, status]);
  const serverKey = JSON.stringify(serverInfo);
  const [seenKey, setSeenKey] = React.useState(serverKey);
  const [info, setInfo] = React.useState<SprintPlanningInfo | null>(serverInfo);
  if (serverKey !== seenKey) {
    setSeenKey(serverKey);
    setInfo(serverInfo);
  }
  const workingDaysTimer = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (workingDaysTimer.current) window.clearTimeout(workingDaysTimer.current);
  }, []);

  const name = sprintDocName(plan.data?.sprintName ?? sprintRow?.name ?? "Sprint");
  const members = React.useMemo(() => (project.data ? docMembers(project.data) : []), [project.data]);
  const isAdmin = rights.isSystemAdmin || rights.perms.isAdmin;
  const canEditDoc = doc.data?.canEdit ?? false;
  const canEditPlan = canEditDoc && !started;
  const canEditCard = canEditDoc && started;
  const scheduleClosed = Boolean(info?.locked) || started;
  const locked = (scheduleClosed || !canEditDoc) && !editingDates;
  const canEditDates = isAdmin && scheduleClosed && !closed;
  const canStart = rights.canStartSprints && (status === "PLANNED" || status === "NEXT");
  const canEnd = rights.canEndSprints && status === "ACTIVE";
  const proofMode = plan.data?.proofVideoMode ?? rights.proofVideoMode;
  const needsReviewVideo = started && sprintReviewVideoRequired(proofMode);
  const reviewVideos = plan.data?.reviewVideos ?? [];

  const planTasks = plan.data?.tasks ?? [];
  const completed = review.data?.completed ?? [];
  const incomplete = review.data?.incomplete ?? [];
  const removed = review.data?.removed ?? [];
  const outcomeTasks = [...completed, ...incomplete];
  const groups = groupOutcome(completed, incomplete, doc.data?.committedIds ?? []);
  const addedCount = groups.added.completed.length + groups.added.incomplete.length;
  const carry = doc.data?.carry ?? {};

  const counted = started
    ? endGaps({ info, incomplete, drafts: reasonDrafts, carry, needsReviewVideo, reviewVideos: reviewVideos.length })
    : startGaps({ info, tasks: planTasks, activeSprintName: plan.data?.activeSprintName ?? null, hideAssignees: rights.isClient });
  // an empty plan has nothing to count, so it says what to do instead
  const gaps = !started && planTasks.length === 0 && !counted.reason ? { total: 0, items: [], reason: "Add at least one task to Next, then start the sprint." } : counted;
  const required = requiredFieldCount({ started, tasks: planTasks.length, hideAssignees: rights.isClient, incomplete: incomplete.length, needsReviewVideo });
  const showMissing = () => missingRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });

  const fail = (err: unknown) => setNotice(errorText(err));
  const patchInfo = (next: Partial<SprintPlanningInfo>) => setInfo((i) => (i ? { ...i, ...next } : i));
  const setDocumentDate = (iso: string) => {
    patchInfo({ documentDateIso: iso, documentDate: iso ? formatPlanningDate(iso) : "" });
    updateInfo.mutate({ documentDateIso: iso }, { onError: fail });
  };
  const setReviewDate = (iso: string) => {
    patchInfo({ reviewDateIso: iso, reviewDate: iso ? formatPlanningDate(iso) : "" });
    updateInfo.mutate({ reviewDateIso: iso }, { onError: fail });
  };
  /** Start and end together: the working days follow, and when both are set so does the sprint itself. */
  const applyDates = (startIso: string, endIso: string) => {
    const both = Boolean(startIso && endIso);
    patchInfo({
      startIso,
      endIso,
      startDate: startIso ? formatPlanningDate(startIso) : "",
      endDate: endIso ? formatPlanningDate(endIso) : "",
      ...(both && endIso >= startIso ? { workingDays: countWorkingDays(startIso, endIso) } : {}),
    });
    if (both && endIso < startIso) return; // shown as the dates' own error; nothing is saved
    setNotice(null);
    updateInfo.mutate({ startIso, endIso }, { onError: fail });
  };
  const handleWorkingDays = (raw: string) => {
    patchInfo({ workingDays: raw });
    if (workingDaysTimer.current) window.clearTimeout(workingDaysTimer.current);
    const days = Number(raw);
    if (raw === "" || !Number.isInteger(days) || days < 1) return;
    const startIso = info?.startIso ?? "";
    workingDaysTimer.current = window.setTimeout(() => {
      if (startIso) applyDates(startIso, endDateForWorkingDays(startIso, days));
      else updateInfo.mutate({ workingDays: days }, { onError: fail });
    }, 400);
  };

  /** An outcome card: how the task ended, with what was typed about it. */
  const card = (t: SprintPlanningTask, done: boolean) => (
    <SprintTaskCard
      key={t.id}
      task={t}
      variant={done ? "completed" : "incomplete"}
      projectId={projectId}
      sprintId={sprintId}
      members={members}
      canEditPlan={false}
      canEditCard={canEditCard}
      hideAssignee={rights.isClient}
      proof={proof.data?.[t.id]}
      carry={carry[t.id]}
      onReason={(taskId, reason) => setReasonDrafts((d) => ({ ...d, [taskId]: reason }))}
      onError={setNotice}
    />
  );

  if (!ids) {
    return (
      <>
        <PageHeader title="Sprint" />
        <EmptyState icon={Flag} title="No such sprint" />
      </>
    );
  }
  if (plan.isPending || doc.isPending || (started && review.isPending)) {
    return (
      <>
        <PageHeader title={name} />
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6" aria-busy>
          <Skeleton className="mx-auto h-10 w-64 rounded-lg" />
          <HeaderCardSkeleton />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </>
    );
  }
  const error = plan.error ?? doc.error ?? review.error;
  if (error || !plan.data) {
    return (
      <>
        <PageHeader title={name} />
        <EmptyState
          icon={Flag}
          title="Could not open this sprint"
          description={error instanceof Error ? error.message : "It may have been deleted."}
          action={
            <Button variant="outline" onClick={pane.back}>
              Back
            </Button>
          }
        />
      </>
    );
  }

  const span = sprintSpanText(info?.startIso ?? "", info?.endIso ?? "");
  const hasIncomplete = incomplete.length > 0;
  // the one button: its ring fills with the required fields; a block that is not about them (another
  // sprint running, dates the wrong way round, nothing to start) is the button's name instead
  const ringReason = gaps.total > 0 ? null : gaps.reason;
  const actions = (
    <>
      {canStart && <RingAction label="Start sprint" icon={<Play className="size-3 fill-current" />} missing={gaps.total} total={required} reason={ringReason} onAct={() => setConfirm("start")} onBlocked={showMissing} pending={start.isPending} data-testid="start-sprint" />}
      {canEnd && <RingAction label="End sprint" icon={<Check className="size-3" strokeWidth={3} />} missing={gaps.total} total={required} reason={ringReason} onAct={() => setConfirm("end")} onBlocked={showMissing} pending={end.isPending} data-testid="end-sprint" />}
      {canEditDates && <HeaderAction label={editingDates ? "Finish editing dates" : "Edit sprint dates"} icon={<Pencil />} variant={editingDates ? "secondary" : "ghost"} onClick={() => setEditingDates((v) => !v)} data-testid="edit-sprint-dates" />}
    </>
  );

  return (
    <>
      <PageHeader title={name} actions={actions} />
      <div className="mx-auto w-full max-w-4xl pb-10" data-testid="sprint-doc" data-phase={started ? "review" : "planning"}>
        <h2 className="mb-10 text-center text-4xl font-bold leading-tight" dir="auto">
          {name}
        </h2>

        <SprintMissing ref={missingRef} gaps={gaps} />
        <SprintSummary tasks={started ? outcomeTasks : planTasks} review={started} added={addedCount} removed={removed.length} />

        {notice && (
          <ErrorNote className="mb-6" onClose={() => setNotice(null)}>
            {notice}
          </ErrorNote>
        )}
        {closed && !rights.isClient && <p className="mb-8 text-center text-xs text-muted-foreground">This sprint document is locked. Only an admin can edit it once the sprint closes.</p>}

        <section className="my-10" data-testid="sprint-info">
          <div className="mb-6 flex items-center gap-3">
            <h2 className="text-2xl font-semibold leading-snug">Sprint Information</h2>
            {editingDates && <span className="rounded-full border border-orange/30 px-2 py-0.5 text-xs font-medium text-orange">Editing dates</span>}
          </div>
          <div className="w-full text-sm">
            <InfoRow label="Plan Date">
              <DateBox value={dayOf(info?.documentDateIso)} disabled={locked} onChange={setDocumentDate} testId="info-plan-date" />
            </InfoRow>
            {started && (
              <InfoRow label="Review Date">
                <DateBox value={dayOf(info?.reviewDateIso)} disabled={!canEditDoc || (status !== "ACTIVE" && !editingDates)} onChange={setReviewDate} testId="info-review-date" />
              </InfoRow>
            )}
            {needsReviewVideo && (
              <InfoRow label="Sprint Review Video">
                <ReviewVideos projectId={projectId} sprintId={sprintId} videos={reviewVideos} canAdd={status === "ACTIVE" && (canEditDoc || rights.canEndSprints)} canRemove={rights.canEndSprints} onError={setNotice} />
              </InfoRow>
            )}
            <InfoRow label="Sprint Start">
              <DateBox value={dayOf(info?.startIso)} disabled={locked} onChange={(v) => applyDates(v, dayOf(info?.endIso))} testId="info-start" />
            </InfoRow>
            <InfoRow label="Sprint End">
              <DateBox value={dayOf(info?.endIso)} disabled={locked} onChange={(v) => applyDates(dayOf(info?.startIso), v)} testId="info-end" />
            </InfoRow>
            <InfoRow label="Total Working Days">
              <input
                type="number"
                min={1}
                step={1}
                required
                inputMode="numeric"
                disabled={locked}
                value={info?.workingDays === "" || info?.workingDays == null ? "" : String(info.workingDays)}
                onChange={(e) => handleWorkingDays(e.target.value)}
                className={cellClass(info?.workingDays === "" || info?.workingDays == null || Number(info.workingDays) < 1)}
                data-testid="info-working-days"
              />
            </InfoRow>
          </div>
        </section>

        <DocHeading>{SPRINT_INTRO_HEADING}</DocHeading>
        <DocParagraph>{SPRINT_INTRO_BLURB}</DocParagraph>

        {!started ? (
          <>
            <DocHeading>{SPRINT_ITEMS_HEADING}</DocHeading>
            <DocParagraph>{SPRINT_ITEMS_BLURB}</DocParagraph>
            {planTasks.length === 0 ? (
              <p className="mt-6 text-sm italic text-muted-foreground">{EMPTY_SPRINT_TASKS_TEXT}</p>
            ) : (
              planTasks.map((t) => (
                <SprintTaskCard key={t.id} task={t} variant="planning" projectId={projectId} sprintId={sprintId} members={members} canEditPlan={canEditPlan} canEditCard={false} hideAssignee={rights.isClient} onError={setNotice} />
              ))
            )}
          </>
        ) : (
          <>
            <OutcomeGroup heading={COMMITTED_HEADING} blurb={COMMITTED_BLURB} completed={groups.committed.completed} incomplete={groups.committed.incomplete} render={card} />
            <OutcomeGroup heading={ADDED_HEADING} blurb={ADDED_BLURB} completed={groups.added.completed} incomplete={groups.added.incomplete} render={card} />
            {closed && removed.length > 0 && (
              <section data-testid="sprint-removed-section">
                <DocHeading>{REMOVED_HEADING}</DocHeading>
                <DocParagraph>{REMOVED_BLURB}</DocParagraph>
                {removed.map((r) => (
                  <SprintTaskCard key={r.task.id} task={r.task} variant="removed" projectId={projectId} sprintId={sprintId} members={members} canEditPlan={false} canEditCard={false} hideAssignee={rights.isClient} removedReason={r.reason} movedTo={r.movedTo} onError={setNotice} />
                ))}
              </section>
            )}
            {!closed && <SprintRemovedPanel removed={removed} />}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "start"}
        onClose={() => setConfirm(null)}
        title="Start sprint"
        description={
          <>
            By starting <span className="font-medium text-foreground">{name}</span> you are committed to delivering the planned tasks between <span className="font-medium text-foreground">{span.start}</span> and{" "}
            <span className="font-medium text-foreground">{span.end}</span> ({span.days} {span.days === 1 ? "day" : "days"}).
          </>
        }
        confirmLabel="Start sprint"
        busyLabel="Starting…"
        onConfirm={() => start.mutateAsync(sprintId)}
        testId="start-sprint-dialog"
      />
      <ConfirmDialog
        open={confirm === "end"}
        onClose={() => setConfirm(null)}
        title="End sprint"
        description={
          hasIncomplete ? (
            <>
              Unfinished items in <span className="font-medium text-foreground">{name}</span> will return to the backlog with the reasons recorded in this review. This sprint will be marked as partially completed.
            </>
          ) : (
            <>
              All tasks in <span className="font-medium text-foreground">{name}</span> are Done. The sprint will be marked as completed.
            </>
          )
        }
        confirmLabel="End sprint"
        busyLabel="Ending…"
        destructive={hasIncomplete}
        onConfirm={() => end.mutateAsync({ sprintId, reasons: reasonsToSend(incomplete, reasonDrafts, carry) })}
        testId="end-sprint-dialog"
      />
    </>
  );
}

/** People who can be given a task: everyone on the project who is not a client. */
function docMembers(p: Pick<ProjectDetail, "members">): Person[] {
  return p.members.filter((m) => m.role !== "CLIENT" && !m.projectRole?.isClient).map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email ?? "Someone", imageUrl: m.user.imageUrl ?? null }));
}

/* ------------------------------------------------------------------------------------------ */
/* Sprint Information                                                                          */
/* ------------------------------------------------------------------------------------------ */

const cellClass = (empty: boolean) => cn("w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 disabled:cursor-default disabled:opacity-70 [color-scheme:dark]", empty && "text-destructive");

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-center gap-x-8 border-b border-border py-3.5">
      <span className="text-foreground">
        {label} <span className="text-destructive">*</span>
      </span>
      {children}
    </div>
  );
}

function DateBox({ value, disabled, onChange, testId }: { value: string; disabled: boolean; onChange: (v: string) => void; testId?: string }) {
  return <input type="date" required disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className={cellClass(value === "")} data-testid={testId} />;
}

/** The sprint review's recording(s) on a "No video" project: listed, removable, with a picker to add more. */
function ReviewVideos({ projectId, sprintId, videos, canAdd, canRemove, onError }: { projectId: string; sprintId: string; videos: SprintReviewVideoDTO[]; canAdd: boolean; canRemove: boolean; onError: (text: string | null) => void }) {
  const addVideos = useAddSprintReviewVideos(projectId, sprintId);
  const removeVideo = useRemoveSprintReviewVideo(projectId, sprintId);
  const [files, setFiles] = React.useState<PickedFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const upload = async () => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    onError(null);
    try {
      const uploaded = await uploadAttachments(
        files.map((f) => f.file),
        (i, pct) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, progress: pct } : f))),
      );
      await addVideos.mutateAsync(uploaded);
      setFiles([]);
    } catch (err) {
      onError(errorText(err));
      setFiles((prev) => prev.map((f) => ({ file: f.file })));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="review-videos">
      {videos.length === 0 && !canAdd && <span className="text-destructive">No recording yet</span>}
      {videos.map((v) => (
        <div key={v.id} className="flex items-center gap-2 text-sm">
          <a href={v.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
            {v.filename}
          </a>
          <span className="text-xs text-muted-foreground">{formatFileSize(v.fileSize)}</span>
          {canRemove && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove video" disabled={uploading} onClick={() => removeVideo.mutate(v.id, { onError: (err) => onError(errorText(err)) })}>
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
      {canAdd && (
        <div className="flex flex-col gap-2">
          <FilePicker files={files} onChange={setFiles} accept="video/*" label={videos.length > 0 ? "Add another recording" : "Add recording"} disabled={uploading} testId="review-video-files" />
          {files.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={upload} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* The outcome                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** One group of the outcome ("Committed work", "Added after the sprint started"): its blurb, then Completed and Not completed. Empty groups print nothing. */
function OutcomeGroup({ heading, blurb, completed, incomplete, render }: { heading: string; blurb: string; completed: SprintPlanningTask[]; incomplete: SprintPlanningTask[]; render: (task: SprintPlanningTask, done: boolean) => React.ReactNode }) {
  if (completed.length === 0 && incomplete.length === 0) return null;
  return (
    <section data-testid="sprint-outcome-group">
      <DocHeading>{heading}</DocHeading>
      <DocParagraph>{blurb}</DocParagraph>
      {completed.length > 0 && (
        <>
          <DocSubheading>{COMPLETED_SUBHEADING}</DocSubheading>
          {completed.map((t) => render(t, true))}
        </>
      )}
      {incomplete.length > 0 && (
        <>
          <DocSubheading>{INCOMPLETE_SUBHEADING}</DocSubheading>
          {incomplete.map((t) => render(t, false))}
        </>
      )}
    </section>
  );
}
