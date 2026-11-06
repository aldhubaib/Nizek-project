"use server";

import { completeSprint, getSprintPlanningTasks, getSprintReviewTasks, startSprint, updateSprint, type SprintDTO } from "@/actions/sprint";
import { getOrCreateSprintDocNote, getSprintDocNote } from "@/actions/meeting-note";
import { requireProjectMember } from "@/lib/auth";
import { canSprint, getAdminPermissions, getPermissionsFromRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  committedSprintTasks,
  sprintCardCarryFromHtml,
  sprintDocHasOutcome,
  sprintDocHtml,
  sprintDocName,
  syncSprintDocOutcome,
  withSprintReviewDate,
  type SprintCardCarry,
} from "@/lib/sprint-doc";
import { canEditSprintDoc, type SprintDocRights } from "@/lib/sprint-doc-access";
import { hasSprintOutcomeCard, withSprintCardCarry } from "@/lib/sprint-doc-patch";
import {
  blankPlanningSchedule,
  formatPlanningDate,
  planningInfoFromHtml,
  syncPlanningDocTasks,
  withPlanningInfo,
  type SprintPlanningInfo,
} from "@/lib/sprint-planning-doc";
import { isUnstartedSprint } from "@/lib/sprint-status";
import { countWorkingDays } from "@/lib/working-days";

/**
 * The sprint document, read and written by the server for a panel that has no document editor.
 *
 * On the live panel the document is a TipTap page: opening it writes the plan (its Sprint
 * Information rows empty, to be filled in), and after the sprint starts opening it again grows
 * the outcome half, which `completeSprint` insists on; typing into a card autosaves the page.
 * The new panel shows the same document as a form page, so these calls do what the editor
 * would have done — the same pure functions over the same data, one card or one row at a time
 * — and the live panel's document stays true. The collaborative copy (`ydoc`) is dropped
 * whenever the HTML is rewritten, so the next editor reads this content and not the stale one.
 */

type SprintRow = { id: string; projectId: string; status: string; name: string };

async function loadSprint(sprintId: string): Promise<SprintRow> {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { id: true, projectId: true, status: true, name: true } });
  if (!sprint) throw new Error("Sprint not found");
  return sprint;
}

/** Who the viewer is to this sprint's document, the shape `canEditSprintDoc` reads. */
async function docRights(projectId: string): Promise<SprintDocRights> {
  const { user, member } = await requireProjectMember(projectId);
  const perms = user.systemRole === "ADMIN" ? getAdminPermissions() : getPermissionsFromRole(member.projectRole);
  return {
    isAdmin: perms.isAdmin,
    canCreateSprintPlanning: canSprint(perms, "createPlanning"),
    canStartSprint: canSprint(perms, "start"),
    canEndSprint: canSprint(perms, "end"),
    isClient: member.role === "CLIENT",
  };
}

async function requireSprintRight(sprintId: string, action: "start" | "end") {
  const sprint = await loadSprint(sprintId);
  const rights = await docRights(sprint.projectId);
  if (rights.isClient) throw new Error("Clients cannot manage sprints");
  const allowed = action === "start" ? rights.canStartSprint : rights.canEndSprint;
  if (!allowed && !rights.isAdmin) {
    throw new Error(action === "start" ? "You do not have permission to start sprints" : "You do not have permission to end sprints");
  }
  return sprint;
}

async function writeDocContent(noteId: string, content: string, date?: string) {
  await prisma.meetingNote.update({
    where: { id: noteId },
    data: { content, ydoc: null, ...(date ? { date: new Date(date) } : {}) },
  });
}

const today = () => new Date().toISOString().slice(0, 10);

type Doc = { id: string; content: string };

/**
 * The document as the editor would leave it on open: written if there is none yet, its task
 * list in step with the sprint while it is being planned, its outcome half in step while it
 * runs, and read back as it is once it has closed. `null` when there is none and this viewer
 * may not write one.
 */
async function ensureSprintDoc(sprint: SprintRow, canEdit: boolean): Promise<Doc | null> {
  const existing = await getSprintDocNote(sprint.projectId, sprint.id);

  if (isUnstartedSprint(sprint.status)) {
    const planning = await getSprintPlanningTasks(sprint.id);
    if (existing) {
      if (!canEdit) return existing;
      const synced = syncPlanningDocTasks(existing.content, planning.tasks);
      if (synced !== existing.content) await writeDocContent(existing.id, synced);
      return { id: existing.id, content: synced };
    }
    if (!canEdit) return null;
    // New planning documents start with an empty Sprint Information table, to be filled in.
    const html = sprintDocHtml(planning.tasks, blankPlanningSchedule(planning.info));
    const doc = await getOrCreateSprintDocNote({ projectId: sprint.projectId, sprintId: sprint.id, title: sprintDocName(planning.sprintName), content: html, date: today() });
    return { id: doc.id, content: doc.created ? html : syncPlanningDocTasks(doc.content, planning.tasks) };
  }

  // Closed: the outcome is signed off, so it is read back rather than rebuilt.
  if (existing && sprint.status !== "ACTIVE") return existing;

  const review = await getSprintReviewTasks(sprint.id);
  if (existing) {
    if (!canEdit) return existing;
    const carry = sprintCardCarryFromHtml(existing.content);
    const dated = withSprintReviewDate(existing.content, review.info.documentDateIso);
    const synced = syncSprintDocOutcome(dated, review.completed, review.incomplete, carry);
    if (synced !== existing.content) await writeDocContent(existing.id, synced);
    return { id: existing.id, content: synced };
  }
  if (!canEdit) return null;
  // A sprint running without a document: both halves are written from where the sprint is now.
  const allTasks = [...review.completed, ...review.incomplete];
  const plan = sprintDocHtml(allTasks, { ...review.info, locked: true });
  const html = syncSprintDocOutcome(withSprintReviewDate(plan, review.info.documentDateIso), review.completed, review.incomplete);
  const doc = await getOrCreateSprintDocNote({ projectId: sprint.projectId, sprintId: sprint.id, title: sprintDocName(review.sprintName), content: html, date: review.info.documentDateIso || today() });
  if (doc.created) return { id: doc.id, content: html };
  if (sprintDocHasOutcome(doc.content)) return doc;
  // Someone created it in between without an outcome; grow ours onto theirs.
  const grown = syncSprintDocOutcome(withSprintReviewDate(doc.content, review.info.documentDateIso), review.completed, review.incomplete, sprintCardCarryFromHtml(doc.content));
  await writeDocContent(doc.id, grown);
  return { id: doc.id, content: grown };
}

export type SprintDocState = {
  /** The document's note, once there is one. */
  noteId: string | null;
  /** The Sprint Information rows as the document holds them (empty until filled in); `null` without a document. */
  info: SprintPlanningInfo | null;
  /** What was typed into each outcome card, by task: the reason, what was delivered, the photos. */
  carry: Record<string, SprintCardCarry>;
  /** The tasks the sprint was started with — what the outcome's "added" group is measured against. */
  committedIds: string[];
  hasOutcome: boolean;
  /** Whether this viewer may write to the document as the sprint stands now. */
  canEdit: boolean;
};

function stateOf(doc: Doc | null, canEdit: boolean): SprintDocState {
  if (!doc) return { noteId: null, info: null, carry: {}, committedIds: [], hasOutcome: false, canEdit };
  return {
    noteId: doc.id,
    info: planningInfoFromHtml(doc.content),
    carry: sprintCardCarryFromHtml(doc.content),
    committedIds: committedSprintTasks(doc.content).map((t) => t.id),
    hasOutcome: sprintDocHasOutcome(doc.content),
    canEdit,
  };
}

/**
 * Open the sprint's document, as the live panel does: written on first open by someone who may
 * write it, brought in step with the sprint on every open after that, read back once closed.
 */
export async function openSprintDoc(sprintId: string): Promise<SprintDocState> {
  const sprint = await loadSprint(sprintId);
  const rights = await docRights(sprint.projectId);
  const canEdit = canEditSprintDoc(rights, sprint.status);
  return stateOf(await ensureSprintDoc(sprint, canEdit), canEdit);
}

async function requireDocWriter(sprintId: string) {
  const sprint = await loadSprint(sprintId);
  const rights = await docRights(sprint.projectId);
  if (!canEditSprintDoc(rights, sprint.status)) {
    throw new Error(
      isUnstartedSprint(sprint.status)
        ? "You do not have permission to edit sprint planning"
        : sprint.status === "ACTIVE"
          ? "You do not have permission to edit the sprint review"
          : "This sprint document is locked once the sprint closes. Only an admin can edit it.",
    );
  }
  const doc = await ensureSprintDoc(sprint, true);
  if (!doc) throw new Error("Could not open the sprint document");
  return { sprint, rights, doc };
}

/**
 * One or more Sprint Information rows: the plan date, the review date, the sprint's start and
 * end (which also move the sprint itself, under `updateSprint`'s rules), the working days. Dates
 * are `YYYY-MM-DD`; an empty string clears a row in the document.
 */
export async function updateSprintDocInfo(input: {
  sprintId: string;
  documentDateIso?: string;
  reviewDateIso?: string;
  startIso?: string;
  endIso?: string;
  workingDays?: number | "";
}): Promise<SprintPlanningInfo | null> {
  const { sprint, doc } = await requireDocWriter(input.sprintId);
  const current = planningInfoFromHtml(doc.content);
  const patch: Partial<SprintPlanningInfo> = {};

  if (input.documentDateIso !== undefined) {
    patch.documentDateIso = input.documentDateIso;
    patch.documentDate = input.documentDateIso ? formatPlanningDate(input.documentDateIso) : "";
  }
  if (input.reviewDateIso !== undefined) {
    patch.reviewDateIso = input.reviewDateIso;
    patch.reviewDate = input.reviewDateIso ? formatPlanningDate(input.reviewDateIso) : "";
  }
  if (input.startIso !== undefined || input.endIso !== undefined) {
    const startIso = input.startIso ?? current?.startIso ?? "";
    const endIso = input.endIso ?? current?.endIso ?? "";
    patch.startIso = startIso;
    patch.endIso = endIso;
    patch.startDate = startIso ? formatPlanningDate(startIso) : "";
    patch.endDate = endIso ? formatPlanningDate(endIso) : "";
    // Both ends known: the sprint itself moves too, and the working days follow.
    if (startIso && endIso) {
      await updateSprint({ sprintId: sprint.id, startDate: startIso, endDate: endIso });
      if (input.workingDays === undefined) patch.workingDays = countWorkingDays(startIso, endIso);
    }
  }
  if (input.workingDays !== undefined) patch.workingDays = input.workingDays;

  const next = withPlanningInfo(doc.content, patch);
  if (next !== doc.content) await writeDocContent(doc.id, next, input.documentDateIso || undefined);
  return planningInfoFromHtml(next);
}

/**
 * What was typed into a task's outcome card: the reason it was not completed, what was
 * delivered and the photos. Only the keys given are written.
 */
export async function updateSprintDocCard(input: { sprintId: string; taskId: string } & Partial<SprintCardCarry>): Promise<SprintCardCarry> {
  const { sprint, doc } = await requireDocWriter(input.sprintId);
  if (isUnstartedSprint(sprint.status)) throw new Error("The sprint has not started, so it has no review yet.");
  if (!hasSprintOutcomeCard(doc.content, input.taskId)) throw new Error("That task is not in this sprint's review.");
  const { sprintId: _s, taskId, ...carry } = input;
  void _s;
  const next = withSprintCardCarry(doc.content, taskId, carry);
  if (next !== doc.content) await writeDocContent(doc.id, next);
  return sprintCardCarryFromHtml(next)[taskId] ?? {};
}

/** The document's status mark, as the live editor sets it when the sprint moves on. Best effort. */
async function stampDocStatus(sprint: SprintRow, patch: Partial<SprintPlanningInfo>) {
  const existing = await getSprintDocNote(sprint.projectId, sprint.id);
  if (!existing) return;
  const next = withPlanningInfo(existing.content, patch);
  if (next !== existing.content) await writeDocContent(existing.id, next);
}

/**
 * Before a sprint starts: its document lists the tasks it holds now (the plan freezes at
 * start, so this is the commitment that gets recorded). Written if there is none yet.
 */
export async function syncSprintPlanDoc(sprintId: string): Promise<{ noteId: string }> {
  const sprint = await requireSprintRight(sprintId, "start");
  if (!isUnstartedSprint(sprint.status)) throw new Error("Only a planned sprint can be started");
  const [existing, planning] = await Promise.all([getSprintDocNote(sprint.projectId, sprintId), getSprintPlanningTasks(sprintId)]);
  if (existing) {
    const synced = syncPlanningDocTasks(existing.content, planning.tasks);
    if (synced !== existing.content) await writeDocContent(existing.id, synced);
    return { noteId: existing.id };
  }
  const doc = await getOrCreateSprintDocNote({
    projectId: sprint.projectId,
    sprintId,
    title: sprintDocName(planning.sprintName),
    content: sprintDocHtml(planning.tasks, planning.info),
    date: planning.info.documentDateIso || today(),
  });
  return { noteId: doc.id };
}

/** The plan is written into the document, the sprint starts, and the document is marked started. */
export async function startSprintFromDoc(sprintId: string): Promise<SprintDTO> {
  await syncSprintPlanDoc(sprintId);
  const started = await startSprint(sprintId);
  await stampDocStatus({ id: started.id, projectId: started.projectId, status: started.status, name: started.name }, { status: started.status });
  return started;
}

/**
 * Before a sprint ends: its document carries the outcome half — what was completed, what was
 * not — built from the sprint as it stands, the way the editor builds it on open. Returns the
 * reasons already written against the incomplete tasks.
 */
export async function prepareSprintReviewDoc(sprintId: string): Promise<{ noteId: string; reasons: Record<string, string> }> {
  const sprint = await requireSprintRight(sprintId, "end");
  if (sprint.status !== "ACTIVE") throw new Error("Only an active sprint can be completed");
  const doc = await ensureSprintDoc(sprint, true);
  if (!doc) throw new Error("Could not open the sprint document");
  const carry = sprintCardCarryFromHtml(doc.content);
  const reasons = Object.fromEntries(Object.entries(carry).flatMap(([id, c]) => (c.incompleteReason?.trim() ? [[id, c.incompleteReason.trim()]] : [])));
  return { noteId: doc.id, reasons };
}

/**
 * The review is brought in step with the sprint, the sprint ends (a reason for every task that
 * was not finished, from the call or from the document), and the document is locked.
 */
export async function endSprintFromDoc(sprintId: string, reasons?: Record<string, string>): Promise<SprintDTO> {
  await prepareSprintReviewDoc(sprintId);
  const closed = await completeSprint(sprintId, reasons);
  await stampDocStatus({ id: closed.id, projectId: closed.projectId, status: closed.status, name: closed.name }, { status: closed.status, locked: true });
  return closed;
}
