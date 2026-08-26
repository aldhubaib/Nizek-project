"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/lib/auth";
import {
  canSprint,
  getAdminPermissions,
  getPermissionsFromRole,
  type SprintAction,
} from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import type { SprintStatus } from "@/generated/prisma/client";
import { isClosedSprint, isCurrentSprintStatus, isUnstartedSprint, comparePlannedSprints, compareClosedSprints, type SprintBoardColumn } from "@/lib/sprint-status";
import { taskCode } from "@/lib/task-label";
import { isBuiltInTaskFieldQuestion } from "@/lib/task-readiness";
import { countWorkingDays } from "@/lib/working-days";
import { logTaskActivity } from "@/lib/activity";
import { broadcastTaskEvent, publish, projectChannel } from "@/lib/centrifugo";
import {
  formatPlanningDate,
  planningDateIso,
  type SprintPlanningInfo,
  type SprintPlanningTask,
} from "@/lib/sprint-planning-doc";
import { incompleteReasonsFromReviewHtml } from "@/lib/sprint-review-doc";
import { announceSprintNoteToChat } from "@/actions/meeting-note";

const SPRINT_SELECT = {
  id: true,
  name: true,
  goal: true,
  startDate: true,
  endDate: true,
  status: true,
  incompleteReason: true,
  completedAt: true,
  sortOrder: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { tasks: { where: { archivedAt: null } } },
  },
} as const;

function serializeSprint(
  sprint: {
    id: string;
    name: string;
    goal: string | null;
    startDate: Date;
    endDate: Date;
    status: SprintStatus;
    incompleteReason: string | null;
    completedAt: Date | null;
    sortOrder: number;
    projectId: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { tasks: number };
  },
) {
  return {
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    startDate: sprint.startDate.toISOString(),
    endDate: sprint.endDate.toISOString(),
    status: sprint.status,
    incompleteReason: sprint.incompleteReason,
    completedAt: sprint.completedAt?.toISOString() ?? null,
    sortOrder: sprint.sortOrder,
    projectId: sprint.projectId,
    createdAt: sprint.createdAt.toISOString(),
    updatedAt: sprint.updatedAt.toISOString(),
    taskCount: sprint._count.tasks,
  };
}

export type SprintDTO = ReturnType<typeof serializeSprint>;

async function requireSprintEditor(projectId: string) {
  const { user, member } = await requireProjectMember(projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot manage sprints");
  const perms =
    user.systemRole === "ADMIN"
      ? getAdminPermissions()
      : getPermissionsFromRole(member.projectRole);
  if (!perms.canModifyTask && !perms.isAdmin) {
    throw new Error("You do not have permission to manage sprints");
  }
  return { user, member, perms };
}

async function requireSprintAction(projectId: string, action: SprintAction) {
  const { user, member } = await requireProjectMember(projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot manage sprints");
  const perms =
    user.systemRole === "ADMIN"
      ? getAdminPermissions()
      : getPermissionsFromRole(member.projectRole);
  if (!canSprint(perms, action)) {
    const message =
      action === "createPlanning"
        ? "You do not have permission to create sprint planning"
        : action === "start"
          ? "You do not have permission to start a sprint"
          : action === "end"
            ? "You do not have permission to end a sprint"
            : "You do not have permission to delete a sprint";
    throw new Error(message);
  }
  return { user, member, perms };
}

function assertCanEditStartedPlanning(isAdmin: boolean, status: string | undefined) {
  if (status && !isUnstartedSprint(status) && !isAdmin) {
    throw new Error("Sprint planning is locked after the sprint starts. Only an admin can edit it.");
  }
}

function promoteSprintTasksToTodo(sprintId: string) {
  return prisma.task.updateMany({
    where: {
      sprintId,
      archivedAt: null,
      stage: { in: ["NEW_REQUEST", "CLARIFICATION"] },
    },
    data: { stage: "READY_FOR_DEV" },
  });
}

/** Move leftover backlog-stage tasks on an active sprint into Todo. */
export async function promoteActiveSprintTasks(sprintId: string): Promise<number> {
  const existing = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { status: true, projectId: true },
  });
  if (!existing) throw new Error("Sprint not found");
  await requireProjectMember(existing.projectId);
  if (existing.status !== "ACTIVE") return 0;
  const result = await promoteSprintTasksToTodo(sprintId);
  if (result.count > 0) {
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
  }
  return result.count;
}

function parseDay(value: string): Date {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid date");
  return new Date(`${day}T00:00:00.000Z`);
}

export async function listSprints(projectId: string): Promise<SprintDTO[]> {
  await requireProjectMember(projectId);
  const sprints = await prisma.sprint.findMany({
    where: { projectId },
    select: SPRINT_SELECT,
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });
  const rank: Record<SprintStatus, number> = {
    ACTIVE: 0,
    NEXT: 1,
    PLANNED: 2,
    COMPLETED: 3,
    PARTIALLY_COMPLETED: 3,
    SHIPPED: 4,
  };
  return sprints
    .slice()
    .sort((a, b) => {
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      if (isUnstartedSprint(a.status) && isUnstartedSprint(b.status)) {
        return comparePlannedSprints(a, b);
      }
      if (isClosedSprint(a.status)) {
        return compareClosedSprints(a, b);
      }
      return a.startDate.getTime() - b.startDate.getTime();
    })
    .map(serializeSprint);
}

export async function createSprint(data: {
  projectId: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}): Promise<SprintDTO> {
  await requireSprintAction(data.projectId, "createPlanning");
  const name = data.name.trim();
  if (!name) throw new Error("Name is required");
  const startDate = parseDay(data.startDate);
  const endDate = parseDay(data.endDate);
  if (endDate < startDate) throw new Error("End date must be on or after the start date");

  const maxOrder = await prisma.sprint.aggregate({
    where: { projectId: data.projectId, status: { in: ["PLANNED", "NEXT"] } },
    _max: { sortOrder: true },
  });

  const sprint = await prisma.sprint.create({
    data: {
      projectId: data.projectId,
      name,
      goal: data.goal?.trim() || null,
      startDate,
      endDate,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
    select: SPRINT_SELECT,
  });

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  return serializeSprint(sprint);
}

export async function reorderPlannedSprints(
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  await requireSprintAction(projectId, "createPlanning");
  const sprints = await prisma.sprint.findMany({
    where: { projectId, id: { in: orderedIds }, status: { in: ["PLANNED", "NEXT"] } },
    select: { id: true },
  });
  if (sprints.length !== orderedIds.length) {
    throw new Error("Only planned sprints can be reordered");
  }
  await prisma.$transaction(
    orderedIds.map((id, sortOrder) =>
      prisma.sprint.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function updateSprint(data: {
  sprintId: string;
  name?: string;
  goal?: string | null;
  startDate?: string;
  endDate?: string;
}): Promise<SprintDTO> {
  const existing = await prisma.sprint.findUnique({ where: { id: data.sprintId } });
  if (!existing) throw new Error("Sprint not found");
  const { perms } = await requireSprintAction(existing.projectId, "createPlanning");
  if (isClosedSprint(existing.status)) throw new Error("Completed sprints cannot be edited");
  if (data.startDate || data.endDate) {
    assertCanEditStartedPlanning(perms.isAdmin, existing.status);
  }

  const name = data.name?.trim();
  const startDate = data.startDate ? parseDay(data.startDate) : existing.startDate;
  const endDate = data.endDate ? parseDay(data.endDate) : existing.endDate;
  if (endDate < startDate) throw new Error("End date must be on or after the start date");

  const sprint = await prisma.sprint.update({
    where: { id: data.sprintId },
    data: {
      ...(name ? { name } : {}),
      ...(data.goal !== undefined ? { goal: data.goal?.trim() || null } : {}),
      startDate,
      endDate,
    },
    select: SPRINT_SELECT,
  });

  revalidatePath(`/dashboard/projects/${existing.projectId}`);
  await publish(projectChannel(existing.projectId), {
    type: "sprint.updated",
    sprintId: data.sprintId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
  return serializeSprint(sprint);
}

export async function setSprintBoardStatus(
  sprintId: string,
  column: SprintBoardColumn,
): Promise<SprintDTO> {
  const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!existing) throw new Error("Sprint not found");
  await requireSprintEditor(existing.projectId);

  const from = existing.status;
  let next: SprintStatus | null = null;

  if (column === "PLANNED" || column === "NEXT") {
    if (!isUnstartedSprint(from)) {
      throw new Error("Only unstarted sprints can move between Planned and Next");
    }
    next = column;
  } else if (column === "SHIPPED") {
    if (from !== "COMPLETED" && from !== "PARTIALLY_COMPLETED" && from !== "SHIPPED") {
      throw new Error("Ship a sprint after it is completed");
    }
    next = "SHIPPED";
  } else if (column === "COMPLETED") {
    if (from !== "SHIPPED" && from !== "COMPLETED" && from !== "PARTIALLY_COMPLETED") {
      throw new Error("Complete the active sprint before moving it here");
    }
    next = from === "PARTIALLY_COMPLETED" || existing.incompleteReason
      ? "PARTIALLY_COMPLETED"
      : "COMPLETED";
  } else {
    throw new Error("Start the sprint to move it to In Progress");
  }

  if (!next) throw new Error("Could not move sprint");
  if (next === "NEXT" && from !== "NEXT") {
    const otherNext = await prisma.sprint.findFirst({
      where: { projectId: existing.projectId, status: "NEXT", id: { not: sprintId } },
      select: { name: true },
    });
    if (otherNext) {
      throw new Error(`Next already has "${otherNext.name}". Move it first.`);
    }
  }
  if (next === from) {
    const current = await prisma.sprint.findUniqueOrThrow({
      where: { id: sprintId },
      select: SPRINT_SELECT,
    });
    return serializeSprint(current);
  }

  const sprint = await prisma.sprint.update({
    where: { id: sprintId },
    data: { status: next },
    select: SPRINT_SELECT,
  });
  revalidatePath(`/dashboard/projects/${existing.projectId}`);
  return serializeSprint(sprint);
}

export async function startSprint(sprintId: string): Promise<SprintDTO> {
  const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!existing) throw new Error("Sprint not found");
  await requireSprintAction(existing.projectId, "start");
  if (!isUnstartedSprint(existing.status)) throw new Error("Only a planned sprint can be started");

  const otherActive = await prisma.sprint.findFirst({
    where: { projectId: existing.projectId, status: "ACTIVE" },
    select: { name: true },
  });
  if (otherActive) {
    throw new Error(`Finish "${otherActive.name}" before starting another sprint`);
  }

  const sprintTasks = await prisma.task.findMany({
    where: { sprintId, archivedAt: null },
    select: { estimatedMinutes: true, assigneeId: true },
  });
  if (sprintTasks.some((task) => !task.estimatedMinutes)) {
    throw new Error("Add an estimate to every task before starting the sprint.");
  }
  if (sprintTasks.some((task) => !task.assigneeId)) {
    throw new Error("Assign every task before starting the sprint.");
  }

  try {
    const [, , sprint] = await prisma.$transaction([
      promoteSprintTasksToTodo(sprintId),
      prisma.task.updateMany({
        where: { sprintId, archivedAt: null },
        data: { unplannedInSprint: false },
      }),
      prisma.sprint.update({
        where: { id: sprintId },
        data: { status: "ACTIVE" },
        select: SPRINT_SELECT,
      }),
    ]);
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
    await announceSprintNoteToChat({
      projectId: existing.projectId,
      sprintId,
      noteType: "SPRINT_PLANNING",
    });
    await publish(projectChannel(existing.projectId), {
      type: "sprint.status-changed",
      sprintId,
      status: "ACTIVE",
    });
    return serializeSprint(sprint);
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "P2002") {
      throw new Error("This project already has an active sprint");
    }
    throw err;
  }
}

export async function completeSprint(
  sprintId: string,
  incompleteReasons?: Record<string, string>,
): Promise<SprintDTO> {
  const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!existing) throw new Error("Sprint not found");
  await requireSprintAction(existing.projectId, "end");
  if (existing.status !== "ACTIVE") throw new Error("Only an active sprint can be completed");

  const sprintTasks = await prisma.task.findMany({
    where: { sprintId, archivedAt: null },
    select: {
      id: true,
      stage: true,
      estimatedMinutes: true,
      assigneeId: true,
      unplannedInSprint: true,
      assignee: { select: { name: true, imageUrl: true } },
    },
  });

  const reviewNotes = await prisma.meetingNote.findMany({
    where: { projectId: existing.projectId, noteType: "SPRINT_REVIEW" },
    select: { content: true },
    orderBy: { createdAt: "desc" },
  });
  const review = reviewNotes.find((note) => note.content.includes(sprintId));
  if (!review) {
    throw new Error("Fill in the sprint review before ending the sprint.");
  }
  const fromReview = incompleteReasonsFromReviewHtml(review.content);

  const unfinished = sprintTasks.filter((t) => t.stage !== "DONE");
  const reasonsByTask: Record<string, string> = {};
  for (const task of unfinished) {
    const reason = incompleteReasons?.[task.id]?.trim() || fromReview[task.id] || "";
    if (!reason) {
      throw new Error("Add a reason for every incomplete item in the sprint review.");
    }
    reasonsByTask[task.id] = reason;
  }
  const status = unfinished.length > 0 ? "PARTIALLY_COMPLETED" : "COMPLETED";
  const sprintReason =
    unfinished.length > 0
      ? unfinished.map((t) => reasonsByTask[t.id]).join("\n")
      : null;

  const [, , sprint] = await prisma.$transaction([
    prisma.sprintTaskSnapshot.createMany({
      data: sprintTasks.map((t) => ({
        sprintId,
        taskId: t.id,
        stage: t.stage,
        estimatedMinutes: t.estimatedMinutes,
        incompleteReason: reasonsByTask[t.id] ?? null,
        assigneeId: t.assigneeId,
        assigneeName: t.assignee?.name ?? null,
        assigneeImageUrl: t.assignee?.imageUrl ?? null,
        unplannedInSprint: t.unplannedInSprint,
      })),
      skipDuplicates: true,
    }),
    prisma.task.updateMany({
      where: {
        sprintId,
        archivedAt: null,
        stage: { not: "DONE" },
      },
      data: {
        sprintId: null,
        estimatedMinutes: null,
        stage: "NEW_REQUEST",
        assigneeId: null,
        unplannedInSprint: false,
      },
    }),
    prisma.sprint.update({
      where: { id: sprintId },
      data: {
        status,
        incompleteReason: sprintReason,
        completedAt: new Date(),
      },
      select: SPRINT_SELECT,
    }),
  ]);

  revalidatePath(`/dashboard/projects/${existing.projectId}`);
  await announceSprintNoteToChat({
    projectId: existing.projectId,
    sprintId,
    noteType: "SPRINT_REVIEW",
  });
  await publish(projectChannel(existing.projectId), {
    type: "sprint.status-changed",
    sprintId,
    status,
  });
  return serializeSprint(sprint);
}

export async function deleteSprint(
  sprintId: string,
  confirmName: string,
): Promise<{ id: string; projectId: string }> {
  const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!existing) throw new Error("Sprint not found");
  await requireSprintAction(existing.projectId, "delete");
  if (confirmName.trim() !== existing.name) {
    throw new Error(`Type "${existing.name}" exactly to delete it`);
  }

  await prisma.$transaction([
    prisma.task.updateMany({
      where: { sprintId },
      data: { assigneeId: null, unplannedInSprint: false },
    }),
    prisma.sprint.delete({ where: { id: sprintId } }),
  ]);
  revalidatePath(`/dashboard/projects/${existing.projectId}`);
  return { id: existing.id, projectId: existing.projectId };
}

export async function setTaskSprint(
  taskId: string,
  sprintId: string | null,
  estimatedMinutes?: number | null,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      archivedAt: true,
      assigneeId: true,
      assignee: { select: { name: true } },
    },
  });
  if (!task || task.archivedAt) throw new Error("Task not found");
  const { user } = await requireSprintEditor(task.projectId);

  let sprintStatus: string | null = null;
  if (sprintId) {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { projectId: true, status: true, name: true },
    });
    if (!sprint || sprint.projectId !== task.projectId) {
      throw new Error("Sprint not found");
    }
    if (isClosedSprint(sprint.status)) {
      throw new Error("Cannot add tasks to a completed sprint");
    }
    sprintStatus = sprint.status;
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      sprintId,
      ...(sprintId
        ? {
            stage: "NEW_REQUEST",
            estimatedMinutes: estimatedMinutes ?? null,
            unplannedInSprint: sprintStatus === "ACTIVE",
          }
        : { assigneeId: null, estimatedMinutes: null, unplannedInSprint: false }),
    },
    select: {
      id: true,
      sprintId: true,
      sprint: { select: { id: true, name: true, status: true } },
    },
  });

  if (!sprintId && task.assigneeId) {
    await logTaskActivity({
      taskId: task.id,
      userId: user.id,
      action: "unassigned",
      field: "assignee",
      oldValue: task.assignee?.name,
    });
  }

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  await publish(projectChannel(task.projectId), {
    type: sprintId ? "sprint.task-assigned" : "sprint.task-removed",
    taskId: updated.id,
    sprintId: sprintId ?? undefined,
    previousSprintId: sprintId ? undefined : task.projectId,
  });
  return {
    taskId: updated.id,
    sprintId: updated.sprintId,
    sprintName: updated.sprint?.name ?? null,
    sprintStatus: updated.sprint?.status ?? null,
  };
}

export interface SprintSnapshotTask {
  id: string;
  taskId: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
  estimatedMinutes: number | null;
  incompleteReason: string | null;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
}

export async function getSprintSnapshots(
  projectId: string,
): Promise<Record<string, SprintSnapshotTask[]>> {
  await requireProjectMember(projectId);

  const completedSprints = await prisma.sprint.findMany({
    where: { projectId, status: { in: ["COMPLETED", "PARTIALLY_COMPLETED", "SHIPPED"] } },
    select: { id: true },
  });

  if (completedSprints.length === 0) return {};

  const sprintIds = completedSprints.map((s) => s.id);

  const snapshots = await prisma.sprintTaskSnapshot.findMany({
    where: { sprintId: { in: sprintIds } },
    select: {
      id: true,
      sprintId: true,
      stage: true,
      estimatedMinutes: true,
      incompleteReason: true,
      assigneeId: true,
      assigneeName: true,
      assigneeImageUrl: true,
      task: {
        select: {
          id: true,
          title: true,
          taskNumber: true,
          taskType: true,
          assignee: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    },
  });

  const result: Record<string, SprintSnapshotTask[]> = {};
  for (const snap of snapshots) {
    const frozenAssignee =
      snap.assigneeId || snap.assigneeName
        ? {
            id: snap.assigneeId ?? "",
            name: snap.assigneeName,
            imageUrl: snap.assigneeImageUrl,
          }
        : snap.task.assignee;
    const entry: SprintSnapshotTask = {
      id: snap.id,
      taskId: snap.task.id,
      title: snap.task.title,
      taskNumber: snap.task.taskNumber,
      taskType: snap.task.taskType,
      stage: snap.stage,
      estimatedMinutes: snap.estimatedMinutes,
      incompleteReason: snap.incompleteReason,
      assignee: frozenAssignee,
    };
    (result[snap.sprintId] ??= []).push(entry);
  }
  return result;
}

export async function getSprintPlanningTasks(sprintId: string): Promise<{
  sprintName: string;
  status: string;
  tasks: SprintPlanningTask[];
  info: SprintPlanningInfo;
  activeSprintName: string | null;
}> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      tasks: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
        include: {
          assignee: { select: { id: true, name: true, imageUrl: true } },
          sprint: { select: { status: true } },
          answers: {
            include: { question: true },
          },
          _count: { select: { sprintSnapshots: true } },
        },
      },
    },
  });
  if (!sprint) throw new Error("Sprint not found");
  await requireProjectMember(sprint.projectId);

  const otherActive = await prisma.sprint.findFirst({
    where: { projectId: sprint.projectId, status: "ACTIVE", id: { not: sprintId } },
    select: { name: true },
  });

  const questions = await prisma.defaultQuestion.findMany({
    orderBy: { order: "asc" },
  });

  const tasks: SprintPlanningTask[] = sprint.tasks.map((task) => {
    const answerByQuestion = new Map(task.answers.map((a) => [a.questionId, a.answer]));
    const typed = questions.filter((q) => q.taskType === task.taskType && !isBuiltInTaskFieldQuestion(q.question));
    return {
      id: task.id,
      code: taskCode(task.taskType, task.taskNumber),
      title: task.title,
      taskType: task.taskType,
      stage: task.stage,
      estimatedMinutes: task.estimatedMinutes,
      sprintCount:
        (task._count.sprintSnapshots ?? 0) +
        (task.sprint && isCurrentSprintStatus(task.sprint.status) ? 1 : 0),
      assignee: task.assignee,
      unplanned: task.unplannedInSprint,
      questions: typed.map((q) => ({
        question: q.question,
        answer: answerByQuestion.get(q.id) ?? "",
      })),
    };
  });

  return {
    sprintName: sprint.name,
    status: sprint.status,
    tasks,
    activeSprintName: otherActive?.name ?? null,
    info: {
      sprintId: sprint.id,
      sprintName: sprint.name,
      status: sprint.status,
      documentDate: formatPlanningDate(new Date()),
      documentDateIso: planningDateIso(new Date()),
      startDate: formatPlanningDate(sprint.startDate),
      endDate: formatPlanningDate(sprint.endDate),
      startIso: planningDateIso(sprint.startDate),
      endIso: planningDateIso(sprint.endDate),
      workingDays: countWorkingDays(sprint.startDate, sprint.endDate),
      locked: isClosedSprint(sprint.status),
    },
  };
}

export async function updateSprintPlanningTask(data: {
  taskId: string;
  estimatedMinutes?: number | null;
  assigneeId?: string | null;
}): Promise<{
  estimatedMinutes: number | null;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
}> {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: {
      id: true,
      projectId: true,
      archivedAt: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true } },
      sprint: { select: { status: true } },
    },
  });
  if (!task || task.archivedAt) throw new Error("Task not found");

  const { user, perms } = await requireSprintEditor(task.projectId);
  assertCanEditStartedPlanning(perms.isAdmin, task.sprint?.status);

  let nextAssignee: { id: string; name: string | null; imageUrl: string | null } | null | undefined;
  if (data.assigneeId !== undefined) {
    if (data.assigneeId) {
      const member = await prisma.projectMember.findFirst({
        where: { projectId: task.projectId, userId: data.assigneeId },
        select: { user: { select: { id: true, name: true, imageUrl: true } } },
      });
      if (!member) throw new Error("That person is not on this project");
      nextAssignee = member.user;
      if (data.assigneeId !== task.assigneeId) {
        await logTaskActivity({
          taskId: task.id,
          userId: user.id,
          action: "assigned",
          field: "assignee",
          oldValue: task.assignee?.name,
          newValue: member.user.name,
        });
      }
    } else {
      nextAssignee = null;
      if (task.assigneeId) {
        await logTaskActivity({
          taskId: task.id,
          userId: user.id,
          action: "unassigned",
          field: "assignee",
          oldValue: task.assignee?.name,
        });
      }
    }
  }

  const minutes =
    data.estimatedMinutes === undefined
      ? undefined
      : data.estimatedMinutes == null
        ? null
        : Math.max(1, Math.round(data.estimatedMinutes));

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(minutes !== undefined && { estimatedMinutes: minutes }),
      ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
    },
    select: {
      estimatedMinutes: true,
      assignee: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  revalidatePath(`/dashboard/projects/${task.projectId}`);
  broadcastTaskEvent(task.projectId, { type: "task-updated", taskId: task.id, userId: user.id });

  return {
    estimatedMinutes: updated.estimatedMinutes,
    assignee: nextAssignee !== undefined ? nextAssignee : updated.assignee,
  };
}

export async function getSprintReviewTasks(sprintId: string): Promise<{
  sprintName: string;
  status: string;
  completed: SprintPlanningTask[];
  incomplete: SprintPlanningTask[];
  info: SprintPlanningInfo;
}> {
  const planning = await getSprintPlanningTasks(sprintId);

  if (isClosedSprint(planning.status)) {
    const [snapshots, questions] = await Promise.all([
      prisma.sprintTaskSnapshot.findMany({
        where: { sprintId },
        select: {
          stage: true,
          estimatedMinutes: true,
          assigneeName: true,
          assigneeImageUrl: true,
          unplannedInSprint: true,
          task: {
            select: {
              id: true,
              title: true,
              taskType: true,
              taskNumber: true,
              assignee: { select: { id: true, name: true, imageUrl: true } },
              answers: { select: { questionId: true, answer: true } },
              _count: { select: { sprintSnapshots: true } },
            },
          },
        },
      }),
      prisma.defaultQuestion.findMany({ orderBy: { order: "asc" } }),
    ]);
    const mapped: SprintPlanningTask[] = snapshots.map((snap) => {
      const answerByQuestion = new Map(snap.task.answers.map((a) => [a.questionId, a.answer]));
      const typed = questions.filter((q) => q.taskType === snap.task.taskType && !isBuiltInTaskFieldQuestion(q.question));
      return {
        id: snap.task.id,
        code: taskCode(snap.task.taskType, snap.task.taskNumber),
        title: snap.task.title,
        taskType: snap.task.taskType,
        stage: snap.stage,
        estimatedMinutes: snap.estimatedMinutes,
        sprintCount: snap.task._count.sprintSnapshots ?? 0,
        assignee:
          snap.assigneeName || snap.task.assignee
            ? {
                id: snap.task.assignee?.id,
                name: snap.assigneeName ?? snap.task.assignee?.name ?? null,
                imageUrl: snap.assigneeImageUrl ?? snap.task.assignee?.imageUrl ?? null,
              }
            : null,
        unplanned: snap.unplannedInSprint,
        questions: typed.map((q) => ({
          question: q.question,
          answer: answerByQuestion.get(q.id) ?? "",
        })),
      };
    });
    return {
      sprintName: planning.sprintName,
      status: planning.status,
      completed: mapped.filter((task) => task.stage === "DONE"),
      incomplete: mapped.filter((task) => task.stage !== "DONE"),
      info: { ...planning.info, variant: "review", locked: true },
    };
  }

  return {
    sprintName: planning.sprintName,
    status: planning.status,
    completed: planning.tasks.filter((task) => task.stage === "DONE"),
    incomplete: planning.tasks.filter((task) => task.stage !== "DONE"),
    info: { ...planning.info, variant: "review", locked: true },
  };
}
