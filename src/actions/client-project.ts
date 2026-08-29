"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import { sprintIdFromPlanningHtml } from "@/lib/sprint-planning-doc";
import { isMissingDataTask } from "@/lib/task-readiness";
import {
  compareClosedSprints,
  comparePlannedSprints,
  isClosedSprint,
  isUnstartedSprint,
} from "@/lib/sprint-status";
import { getTasksByProject } from "@/actions/task";
import type { KanbanTask } from "@/store/kanban";

/**
 * The client's read-only window onto their project, served from the chat.
 *
 * Staff read the same data through getTasksByProject / getMeetingNotes, but
 * those ship every task plus full note HTML, comment threads and edit history.
 * This returns only what the panel draws, so a client never receives internal
 * fields they have no screen for.
 */

export type ClientSprintDocRef = {
  id: string;
  title: string;
  kind: "SPRINT_PLANNING" | "SPRINT_REVIEW";
  date: string;
  /** Plain-text opening of the body, for the card. The HTML stays server-side. */
  preview: string;
};

/**
 * A sprint with its documents attached. Shaped per sprint rather than as a flat
 * document list because the client browses by sprint — landing on the one in
 * progress and stepping across to planned and completed ones.
 */
export type ClientSprintEntry = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  goal: string | null;
  taskCount: number;
  docs: ClientSprintDocRef[];
};

export type ClientBacklogTask = {
  id: string;
  taskNumber: number;
  title: string;
  taskType: string;
};

export type ClientSprintTask = ClientBacklogTask & {
  stage: string;
  sprintCount?: number;
};

export type ClientDeadline = {
  id: string;
  title: string;
  dueDate: string;
};

export type ClientProjectOverview = {
  projectName: string;
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  inDevelopmentCount: number;
  clientReviewCount: number;
  backlogCount: number;
  stageBreakdown: Record<string, number>;
  typeBreakdown: Record<string, number>;
  typedTasks: ClientSprintTask[];
  activeSprint: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    goal: string | null;
    total: number;
    done: number;
  } | null;
  nextSprint: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    taskCount: number;
  } | null;
  sprintTasks: ClientSprintTask[];
  deadlines: ClientDeadline[];
  sprints: ClientSprintEntry[];
  backlog: ClientBacklogTask[];
};

/** Enough body text to fill a card, with the markup left behind. */
function plainTextPreview(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/** Current work first, then what's queued, then history — same as the roadmap. */
const BROWSE_RANK: Record<string, number> = {
  ACTIVE: 0,
  NEXT: 1,
  PLANNED: 2,
  COMPLETED: 3,
  PARTIALLY_COMPLETED: 3,
  SHIPPED: 4,
};

type SprintOrderRow = {
  status: string;
  sortOrder: number;
  startDate: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

function compareForBrowsing(a: SprintOrderRow, b: SprintOrderRow): number {
  const byStatus = (BROWSE_RANK[a.status] ?? 2) - (BROWSE_RANK[b.status] ?? 2);
  if (byStatus !== 0) return byStatus;
  if (isUnstartedSprint(a.status) && isUnstartedSprint(b.status)) {
    return comparePlannedSprints(a, b);
  }
  if (isClosedSprint(a.status)) return compareClosedSprints(a, b);
  return 0;
}

/** Stages that read as "being worked on" rather than queued or finished. */
const IN_PROGRESS_STAGES = new Set([
  "READY_FOR_DEV",
  "IN_DEVELOPMENT",
  "INTERNAL_REVIEW",
  "CLIENT_REVIEW",
  "READY_FOR_RELEASE",
]);

export async function getClientProjectOverview(
  projectId: string,
): Promise<ClientProjectOverview> {
  await requireProjectMember(projectId);

  const [project, tasks, sprints, notes, deadlines] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    }),
    // Reused rather than re-queried: isReadyForTransition is derived from spec
    // answers, and the Backlog/Missing Data split has to match the planner's.
    getTasksByProject(projectId) as unknown as Promise<KanbanTask[]>,
    prisma.sprint.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        goal: true,
        status: true,
        sortOrder: true,
        startDate: true,
        endDate: true,
        completedAt: true,
        updatedAt: true,
      },
    }),
    prisma.meetingNote.findMany({
      where: {
        projectId,
        noteType: { in: ["SPRINT_PLANNING", "SPRINT_REVIEW"] },
      },
      select: {
        id: true,
        title: true,
        noteType: true,
        content: true,
        createdAt: true,
      },
      orderBy: { date: "desc" },
    }),
    prisma.meetingNote.findMany({
      where: {
        projectId,
        noteType: "DEADLINE",
        completedAt: null,
        dueDate: { not: null },
      },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
  ]);

  // Which sprint a document belongs to is encoded in its HTML rather than a
  // column, so the markup is unwrapped here and never sent to the browser.
  const docsBySprint = new Map<string, ClientSprintDocRef[]>();
  for (const note of notes) {
    const sprintId = sprintIdFromPlanningHtml(note.content);
    if (!sprintId) continue;
    const list = docsBySprint.get(sprintId) ?? [];
    list.push({
      id: note.id,
      title: note.title,
      kind: note.noteType as "SPRINT_PLANNING" | "SPRINT_REVIEW",
      date: note.createdAt.toISOString(),
      preview: plainTextPreview(note.content),
    });
    docsBySprint.set(sprintId, list);
  }

  const taskCounts = new Map<string, number>();
  for (const task of tasks) {
    if (!task.sprintId) continue;
    taskCounts.set(task.sprintId, (taskCounts.get(task.sprintId) ?? 0) + 1);
  }

  // Same two rules the planner's Backlog zone uses: not in a sprint, not done,
  // and past triage — half-filled new requests sit in Missing Data, not here.
  const backlog = tasks
    .filter((t) => !t.sprintId && t.stage !== "DONE" && !isMissingDataTask(t))
    .sort((a, b) => a.order - b.order);

  const active = sprints.find((s) => s.status === "ACTIVE") ?? null;
  const next = sprints.find((s) => s.status === "NEXT") ?? null;
  const activeTasks = active
    ? tasks.filter((t) => t.sprintId === active.id)
    : [];

  const stageBreakdown: Record<string, number> = {};
  const typeBreakdown: Record<string, number> = {};
  for (const task of tasks) {
    stageBreakdown[task.stage] = (stageBreakdown[task.stage] ?? 0) + 1;
    typeBreakdown[task.taskType] = (typeBreakdown[task.taskType] ?? 0) + 1;
  }

  const typedTasks = tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      taskNumber: t.taskNumber,
      title: t.title,
      taskType: t.taskType,
      stage: t.stage,
      sprintCount: t.sprintCount,
    }));

  const sprintTasks = (active ? activeTasks : tasks.filter((t) => IN_PROGRESS_STAGES.has(t.stage)))
    .filter((t) => t.stage !== "DONE")
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      taskNumber: t.taskNumber,
      title: t.title,
      taskType: t.taskType,
      stage: t.stage,
      sprintCount: t.sprintCount,
    }));

  return {
    projectName: project.name,
    totalTasks: tasks.length,
    doneTasks: tasks.filter((t) => t.stage === "DONE").length,
    inProgressTasks: tasks.filter((t) => IN_PROGRESS_STAGES.has(t.stage)).length,
    inDevelopmentCount: tasks.filter((t) => t.stage === "IN_DEVELOPMENT").length,
    clientReviewCount: tasks.filter((t) => t.stage === "CLIENT_REVIEW").length,
    backlogCount: backlog.length,
    stageBreakdown,
    typeBreakdown,
    typedTasks,
    activeSprint: active
      ? {
          id: active.id,
          name: active.name,
          startDate: active.startDate.toISOString(),
          endDate: active.endDate.toISOString(),
          goal: active.goal,
          total: activeTasks.length,
          done: activeTasks.filter((t) => t.stage === "DONE").length,
        }
      : null,
    nextSprint: next
      ? {
          id: next.id,
          name: next.name,
          startDate: next.startDate.toISOString(),
          endDate: next.endDate.toISOString(),
          taskCount: taskCounts.get(next.id) ?? 0,
        }
      : null,
    sprintTasks,
    deadlines: deadlines
      .filter((d): d is typeof d & { dueDate: Date } => d.dueDate != null)
      .map((d) => ({
        id: d.id,
        title: d.title,
        dueDate: d.dueDate.toISOString(),
      })),
    sprints: sprints
      .slice()
      .sort(compareForBrowsing)
      .map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        goal: s.goal,
        taskCount: taskCounts.get(s.id) ?? 0,
        docs: docsBySprint.get(s.id) ?? [],
      })),
    backlog: backlog.map((t) => ({
      id: t.id,
      taskNumber: t.taskNumber,
      title: t.title,
      taskType: t.taskType,
    })),
  };
}

export type ClientSprintDocContent = {
  title: string;
  content: string;
  date: string;
};

/** Body of one sprint document, fetched only when the client opens it. */
export async function getClientSprintDoc(
  noteId: string,
): Promise<ClientSprintDocContent> {
  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    select: {
      title: true,
      content: true,
      date: true,
      noteType: true,
      projectId: true,
    },
  });
  if (!note) throw new Error("Document not found");
  if (note.noteType !== "SPRINT_PLANNING" && note.noteType !== "SPRINT_REVIEW") {
    throw new Error("Document not found");
  }
  await requireProjectMember(note.projectId);

  return {
    title: note.title,
    content: note.content,
    date: note.date.toISOString(),
  };
}
