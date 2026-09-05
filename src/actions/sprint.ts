"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireUser } from "@/lib/auth";
import {
  canSprint,
  getAdminPermissions,
  getPermissionsFromRole,
  type SprintAction,
} from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import type { SprintStatus } from "@/generated/prisma/client";
import { isAwaitingApproval, isClosedSprint, isCurrentSprintStatus, isUnstartedSprint, comparePlannedSprints, compareClosedSprints, sprintDepartureToRecord, type SprintBoardColumn } from "@/lib/sprint-status";
import { moveNeedsReason } from "@/lib/sprint-task-move";
import { NO_SPRINT_DOC_RIGHTS, type SprintDocRights } from "@/lib/sprint-doc-access";
import { stageForSprintStatus } from "@/lib/task-stage";
import { taskCode, type TaskPriorityId } from "@/lib/task-label";
import { isBuiltInTaskFieldQuestion } from "@/lib/task-readiness";
import { countWorkingDays } from "@/lib/working-days";
import { logTaskActivity } from "@/lib/activity";
import {
  applyBulkStageChange,
  applyStageChange,
  type StageWriteClient,
} from "@/lib/stage-transition";
import { broadcastTaskEvent, publish, projectChannel } from "@/lib/centrifugo";
import {
  formatPlanningDate,
  planningDateIso,
  planningInfoFromHtml,
  type SprintPlanningInfo,
  type SprintPlanningTask,
  type SprintTaskProof,
} from "@/lib/sprint-planning-doc";
import {
  sprintDocHasOutcome,
  sprintRemovedSectionHtml,
  REMOVED_HEADING,
  type SprintRemovedTask,
} from "@/lib/sprint-doc";
import { incompleteReasonsFromReviewHtml, reviewDateBySprintId } from "@/lib/sprint-review-doc";
import {
  announceSprintNoteToChat,
  announceSprintScopeChangeToChat,
} from "@/actions/meeting-note";
import { isClientUser } from "@/lib/client-chat";
import { isProofApprovedStage } from "@/lib/proof-of-work";

/**
 * A partial unique index rejected the write.
 *
 * The one-ACTIVE and one-NEXT indexes are what actually keep two replicas from
 * both winning; the reads before them only exist to produce a better message.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    String((err as { code: unknown }).code) === "P2002"
  );
}

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
  reviewDate?: string | null,
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
    reviewDate: reviewDate ?? null,
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

export type SprintApprovalState = {
  status: SprintStatus;
  /** Named in the confirmation, so they can see what they are signing off. */
  sprintName: string;
  /** Sitting in Completed, waiting on the client. */
  awaitingApproval: boolean;
  /** Only the client accepts a sprint; everyone else just reads the state. */
  canApprove: boolean;
};

/** Drives the Approve button on a sprint review card in chat. */
export async function getSprintApprovalState(
  sprintId: string,
): Promise<SprintApprovalState> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { status: true, projectId: true, name: true },
  });
  if (!sprint) throw new Error("Sprint not found");
  const { user } = await requireProjectMember(sprint.projectId);

  const awaitingApproval = isAwaitingApproval(sprint.status);
  return {
    status: sprint.status,
    sprintName: sprint.name,
    awaitingApproval,
    canApprove: awaitingApproval && isClientUser(user),
  };
}

/**
 * What the viewer may do with a sprint's document, for the places that open it
 * without a project page behind them to have worked this out already — a chat
 * card, most of all. The document itself decides what that means for the phase
 * the sprint is in; this only reports the rights.
 */
export async function getSprintDocRights(sprintId: string): Promise<SprintDocRights> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { projectId: true },
  });
  if (!sprint) return NO_SPRINT_DOC_RIGHTS;
  const { user, member } = await requireProjectMember(sprint.projectId);
  if (isClientUser(user) || member.role === "CLIENT") {
    return { ...NO_SPRINT_DOC_RIGHTS, isClient: true };
  }
  const perms =
    user.systemRole === "ADMIN"
      ? getAdminPermissions()
      : getPermissionsFromRole(member.projectRole);
  return {
    isAdmin: perms.isAdmin,
    canCreateSprintPlanning: perms.canCreateSprintPlanning,
    canStartSprint: perms.canStartSprint,
    canEndSprint: perms.canEndSprint,
    isClient: false,
  };
}

/**
 * The client accepting a completed sprint, from the review card in their chat.
 *
 * Staff reach the same transition by dragging the sprint into Shipped, which
 * setSprintBoardStatus guards behind sprint-editor permissions. Shipping was
 * always the client's call to make — this is the only path that lets them make
 * it, so the role check here is the mirror image of the one over there.
 */
export async function approveSprint(sprintId: string): Promise<SprintDTO> {
  const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!existing) throw new Error("Sprint not found");
  const { user } = await requireProjectMember(existing.projectId);
  if (!isClientUser(user)) throw new Error("Only the client can approve a sprint");

  // Two taps on a slow connection, or the card reopened after someone shipped
  // it from the board: report the state rather than an error.
  if (existing.status === "SHIPPED") {
    const current = await prisma.sprint.findUniqueOrThrow({
      where: { id: sprintId },
      select: SPRINT_SELECT,
    });
    return serializeSprint(current);
  }
  if (!isAwaitingApproval(existing.status)) {
    throw new Error("A sprint can be approved once it is completed");
  }

  const sprint = await prisma.$transaction(async (tx) => {
    const updated = await tx.sprint.update({
      where: { id: sprintId },
      data: { status: "SHIPPED" },
      select: SPRINT_SELECT,
    });
    await projectSprintOntoTasks(tx, {
      sprintId,
      sprintName: existing.name,
      status: "SHIPPED",
      actorId: user.id,
      reason: `${existing.name} accepted and shipped`,
    });
    return updated;
  });

  revalidatePath(`/dashboard/projects/${existing.projectId}`);
  // Staff boards are open on the other side of this; without the event the
  // sprint sits in Completed until someone reloads.
  await publish(projectChannel(existing.projectId), {
    type: "sprint.updated",
    sprintId,
  });
  return serializeSprint(sprint);
}

function assertCanEditStartedPlanning(isAdmin: boolean, status: string | undefined) {
  if (status && !isUnstartedSprint(status) && !isAdmin) {
    throw new Error("Sprint planning is locked after the sprint starts. Only an admin can edit it.");
  }
}

async function promoteSprintTasksToTodo(
  tx: StageWriteClient,
  sprint: { id: string; name: string },
  actorId: string,
): Promise<number> {
  // Everything the sprint holds, not just the pre-sprint stages: starting a
  // sprint moves its Planned or Next tasks into Todo, and those are exactly the
  // stages a task waiting to start is in.
  const tasks = await tx.task.findMany({
    where: {
      sprintId: sprint.id,
      archivedAt: null,
      stage: { in: ["BACKLOG", "PLANNED", "NEXT"] },
    },
    select: { id: true, stage: true, assigneeId: true },
  });
  if (tasks.length === 0) return 0;

  await tx.task.updateMany({
    where: { id: { in: tasks.map((t) => t.id) } },
    data: { stage: "TODO" },
  });

  await applyBulkStageChange(tx, {
    tasks,
    toStage: "TODO",
    actorId,
    source: "SPRINT_START",
    reason: `${sprint.name} started`,
    sprintId: sprint.id,
    sprintName: sprint.name,
  });

  return tasks.length;
}

/** Move leftover backlog-stage tasks on an active sprint into Todo. */
export async function promoteActiveSprintTasks(sprintId: string): Promise<number> {
  const existing = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { status: true, projectId: true, name: true },
  });
  if (!existing) throw new Error("Sprint not found");
  const { user } = await requireProjectMember(existing.projectId);
  if (existing.status !== "ACTIVE") return 0;
  const count = await prisma.$transaction((tx) =>
    promoteSprintTasksToTodo(tx, { id: sprintId, name: existing.name }, user.id),
  );
  if (count > 0) {
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
  }
  return count;
}

function parseDay(value: string): Date {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid date");
  return new Date(`${day}T00:00:00.000Z`);
}

export async function listSprints(projectId: string): Promise<SprintDTO[]> {
  await requireProjectMember(projectId);
  const [sprints, sprintDocs] = await Promise.all([
    prisma.sprint.findMany({
      where: { projectId },
      select: SPRINT_SELECT,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    }),
    prisma.meetingNote.findMany({
      where: { projectId, noteType: "SPRINT_DOC" },
      select: { content: true, sprintId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const docReviewDates = reviewDateBySprintId(sprintDocs);
  // A document nobody dated still has a review date: the day the sprint ended.
  const reviewDateFor = (sprint: { id: string; completedAt: Date | null }) =>
    docReviewDates.get(sprint.id) ??
    (sprint.completedAt ? planningDateIso(sprint.completedAt) : null);
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
      const left = { ...a, reviewDate: reviewDateFor(a) };
      const right = { ...b, reviewDate: reviewDateFor(b) };
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      if (isUnstartedSprint(a.status) && isUnstartedSprint(b.status)) {
        return comparePlannedSprints(a, b);
      }
      if (isClosedSprint(a.status)) {
        return compareClosedSprints(left, right);
      }
      return a.startDate.getTime() - b.startDate.getTime();
    })
    .map((sprint) => serializeSprint(sprint, reviewDateFor(sprint)));
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

/** `Sprint 1`, `Sprint 2`, ... continuing from the highest already used. */
function nextSprintName(names: string[]): string {
  let max = 0;
  for (const name of names) {
    const match = name.match(/^Sprint\s+(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Sprint ${max + 1}`;
}

/**
 * The sprint sitting in a board column, created if the column is empty.
 *
 * The roadmap used to do this itself: read its own props, and if it saw nothing
 * there, call createSprint and then setSprintBoardStatus. Two people dragging
 * into an empty Next each read empty and each created a sprint, and only one of
 * them was ever rendered — the other person's tasks went somewhere they could
 * not see. The advisory lock makes the read and the create one step, so the
 * second caller waits and then finds the first caller's sprint.
 */
export async function ensureSprintForColumn(
  projectId: string,
  column: "PLANNED" | "NEXT",
): Promise<SprintDTO> {
  const { user } = await requireSprintAction(projectId, "createPlanning");

  const sprint = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT true AS locked
      FROM pg_advisory_xact_lock(hashtext(${`sprint-column:${projectId}:${column}`})::bigint)
    `;

    const existing = await tx.sprint.findFirst({
      where: { projectId, status: column },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: SPRINT_SELECT,
    });
    if (existing) return existing;

    const open = await tx.sprint.findMany({
      where: { projectId, status: { in: ["PLANNED", "NEXT"] } },
      select: { name: true, sortOrder: true },
    });
    const startDate = new Date();
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() + 13);

    const created = await tx.sprint.create({
      data: {
        projectId,
        name: nextSprintName(open.map((s) => s.name)),
        startDate,
        endDate,
        status: column,
        sortOrder: Math.max(-1, ...open.map((s) => s.sortOrder)) + 1,
      },
      select: SPRINT_SELECT,
    });

    // Created directly in the column rather than created-then-moved, so there is
    // no moment where a Next sprint is briefly Planned and visible in the wrong
    // place to everyone else.
    if (column === "NEXT") {
      await projectSprintOntoTasks(tx, {
        sprintId: created.id,
        sprintName: created.name,
        status: "NEXT",
        actorId: user.id,
      });
    }

    return created;
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  await publish(projectChannel(projectId), {
    type: "sprint.status-changed",
    sprintId: sprint.id,
    status: sprint.status,
  });
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
  const { user } = await requireSprintEditor(existing.projectId);

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
  if (next === from) {
    const current = await prisma.sprint.findUniqueOrThrow({
      where: { id: sprintId },
      select: SPRINT_SELECT,
    });
    return serializeSprint(current);
  }

  const nextStatus = next;
  try {
    const sprint = await prisma.$transaction(async (tx) => {
    // Read inside the transaction so a second person dragging another sprint
    // into Next at the same moment cannot slip past this. Sprint_one_next_per_project
    // is the real guarantee; this exists to name the sprint already in the way.
    if (nextStatus === "NEXT") {
      const otherNext = await tx.sprint.findFirst({
        where: { projectId: existing.projectId, status: "NEXT", id: { not: sprintId } },
        select: { name: true },
      });
      if (otherNext) {
        throw new Error(`Next already has "${otherNext.name}". Move it first.`);
      }
    }

    const updated = await tx.sprint.update({
      where: { id: sprintId },
      data: { status: nextStatus },
      select: SPRINT_SELECT,
    });

    // The tasks follow the sprint. Moving a sprint from Planned to Next used to
    // change nothing on its tasks, so the roadmap said Next while every card in
    // it still read Backlog.
    await projectSprintOntoTasks(tx, {
      sprintId,
      sprintName: existing.name,
      status: nextStatus,
      actorId: user.id,
      // Completed to Shipped is the client accepting the sprint. It is optional
      // and deliberate, so it is worth being able to say who did it.
      reason:
        nextStatus === "SHIPPED"
          ? `${existing.name} accepted and shipped`
          : `${existing.name} moved to ${nextStatus.replace("_", " ").toLowerCase()}`,
    });

      return updated;
    });

    revalidatePath(`/dashboard/projects/${existing.projectId}`);
    return serializeSprint(sprint);
  } catch (err) {
    // The other transaction committed between the read above and this write, so
    // Sprint_one_next_per_project caught what the read could not.
    if (nextStatus === "NEXT" && isUniqueViolation(err)) {
      throw new Error("Someone else just moved a sprint into Next. Refresh and try again.");
    }
    throw err;
  }
}

/**
 * Push a sprint's status down onto every task it holds.
 *
 * Only for the statuses that map to a single task stage. ACTIVE is excluded:
 * once a sprint is running its tasks each hold their own work stage, and
 * flattening them would erase that.
 */
async function projectSprintOntoTasks(
  tx: StageWriteClient,
  args: {
    sprintId: string;
    sprintName: string;
    status: SprintStatus;
    actorId: string;
    reason?: string;
  },
): Promise<void> {
  const targetStage = stageForSprintStatus(args.status);
  if (!targetStage) return;

  const tasks = await tx.task.findMany({
    where: { sprintId: args.sprintId, archivedAt: null, stage: { not: targetStage } },
    select: { id: true, stage: true, assigneeId: true },
  });
  if (tasks.length === 0) return;

  await tx.task.updateMany({
    where: { id: { in: tasks.map((t) => t.id) } },
    data: { stage: targetStage },
  });

  await applyBulkStageChange(tx, {
    tasks,
    toStage: targetStage,
    actorId: args.actorId,
    source: "SPRINT_STATUS",
    reason: args.reason ?? null,
    sprintId: args.sprintId,
    sprintName: args.sprintName,
  });
}

export async function startSprint(sprintId: string): Promise<SprintDTO> {
  const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!existing) throw new Error("Sprint not found");
  const { user } = await requireSprintAction(existing.projectId, "start");
  if (!isUnstartedSprint(existing.status)) throw new Error("Only a planned sprint can be started");

  try {
    const sprint = await prisma.$transaction(async (tx) => {
      // Everything below reads the sprint's contents and then acts on them, so
      // it has to be serialised against a concurrent drag or a second person
      // pressing Start. Previously the checks ran outside the transaction and a
      // task added in the gap was promoted to Todo without an estimate.
      await tx.$queryRaw`
        SELECT true AS locked
        FROM pg_advisory_xact_lock(hashtext(${`sprint-start:${existing.projectId}`})::bigint)
      `;

      const otherActive = await tx.sprint.findFirst({
        where: { projectId: existing.projectId, status: "ACTIVE" },
        select: { name: true },
      });
      if (otherActive) {
        throw new Error(`Finish "${otherActive.name}" before starting another sprint`);
      }

      const current = await tx.sprint.findUnique({
        where: { id: sprintId },
        select: { status: true },
      });
      if (!current || !isUnstartedSprint(current.status)) {
        throw new Error("Only a planned sprint can be started");
      }

      const sprintTasks = await tx.task.findMany({
        where: { sprintId, archivedAt: null },
        select: { id: true, estimatedMinutes: true, assigneeId: true },
      });
      if (sprintTasks.some((task) => !task.estimatedMinutes)) {
        throw new Error("Add an estimate to every task before starting the sprint.");
      }
      if (sprintTasks.some((task) => !task.assigneeId)) {
        throw new Error("Assign every task before starting the sprint.");
      }

      // Decision and Risk used to be checked only in the browser, so anything
      // that skipped the editor skipped the rule entirely.
      const plans = await tx.sprintTaskPlan.findMany({
        where: { sprintId },
        select: { taskId: true, decision: true, risk: true },
      });
      const planByTask = new Map(plans.map((p) => [p.taskId, p]));
      const unplanned = sprintTasks.filter((task) => {
        const plan = planByTask.get(task.id);
        return !plan?.decision.trim() || !plan?.risk.trim();
      });
      if (unplanned.length > 0) {
        throw new Error(
          "Fill in Decision and Risk for every task in the planning document before starting the sprint.",
        );
      }

      await promoteSprintTasksToTodo(tx, { id: sprintId, name: existing.name }, user.id);
      await tx.task.updateMany({
        where: { sprintId, archivedAt: null },
        data: { unplannedInSprint: false, unplannedReason: null },
      });
      return tx.sprint.update({
        where: { id: sprintId },
        data: { status: "ACTIVE" },
        select: SPRINT_SELECT,
      });
    });
    revalidatePath(`/dashboard/projects/${existing.projectId}`);
    await announceSprintNoteToChat({
      projectId: existing.projectId,
      sprintId,
      card: "SPRINT_PLANNING",
    });
    await publish(projectChannel(existing.projectId), {
      type: "sprint.status-changed",
      sprintId,
      status: "ACTIVE",
    });
    return serializeSprint(sprint);
  } catch (err) {
    if (isUniqueViolation(err)) {
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
  const { user } = await requireSprintAction(existing.projectId, "end");
  if (existing.status !== "ACTIVE") throw new Error("Only an active sprint can be completed");

  const sprintTasks = await prisma.task.findMany({
    where: { sprintId, archivedAt: null },
    select: {
      id: true,
      stage: true,
      estimatedMinutes: true,
      assigneeId: true,
      unplannedInSprint: true,
      unplannedReason: true,
      assignee: { select: { name: true, imageUrl: true } },
      // Newest first: the proof a task carries out of the sprint is the one
      // that got it through review.
      proofOfWork: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });

  const doc = await prisma.meetingNote.findFirst({
    where: { projectId: existing.projectId, sprintId, noteType: "SPRINT_DOC" },
    select: { content: true },
  });
  if (!doc || !sprintDocHasOutcome(doc.content)) {
    throw new Error("Fill in the sprint review before ending the sprint.");
  }
  const reviewDateIso = planningInfoFromHtml(doc.content)?.reviewDateIso || null;
  const fromReview = incompleteReasonsFromReviewHtml(doc.content);
  const removed = await getSprintRemovedTasks(sprintId);

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

  const sprint = await prisma.$transaction(async (tx) => {
    await tx.sprintTaskSnapshot.createMany({
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
        unplannedReason: t.unplannedReason,
        proofOfWorkId: t.stage === "DONE" ? (t.proofOfWork[0]?.id ?? null) : null,
      })),
      skipDuplicates: true,
    });

    if (unfinished.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: unfinished.map((t) => t.id) } },
        data: {
          sprintId: null,
          estimatedMinutes: null,
          stage: "BACKLOG",
          assigneeId: null,
          unplannedInSprint: false,
          unplannedReason: null,
        },
      });

      // Sent back unfinished. Each task carries the reason given for it in the
      // sprint review, so the history explains the reversal rather than just
      // showing the task reappearing in the backlog.
      await applyBulkStageChange(tx, {
        tasks: unfinished.map((t) => ({
          id: t.id,
          stage: t.stage,
          assigneeId: t.assigneeId,
          reason: reasonsByTask[t.id] ?? null,
        })),
        toStage: "BACKLOG",
        actorId: user.id,
        source: "SPRINT_COMPLETE",
        sprintId,
        sprintName: existing.name,
      });
    }

    const updated = await tx.sprint.update({
      where: { id: sprintId },
      data: {
        status,
        incompleteReason: sprintReason,
        completedAt: reviewDateIso
          ? new Date(`${reviewDateIso}T12:00:00.000Z`)
          : new Date(),
      },
      select: SPRINT_SELECT,
    });

    // The departures become part of the document at the moment they stop
    // changing. While the sprint ran they were a panel beside it, because a
    // list that moves with every drag is not worth writing down; from here the
    // document is the record, and a record that leaves out what was dropped is
    // one that can be read as though the sprint delivered everything it took
    // on. Re-read inside the transaction so an autosave landing mid-flight is
    // not overwritten by the copy this action loaded at the start.
    const section = sprintRemovedSectionHtml(removed);
    if (section) {
      const note = await tx.meetingNote.findFirst({
        where: { projectId: existing.projectId, sprintId, noteType: "SPRINT_DOC" },
        select: { id: true, content: true },
      });
      if (note && !note.content.includes(`>${REMOVED_HEADING}<`)) {
        await tx.meetingNote.update({
          where: { id: note.id },
          // The collaborative copy is dropped so the next reader rebuilds from
          // this content. It outranks the ydoc, which knows nothing of a
          // section written by the server.
          data: { content: `${note.content}${section}`, ydoc: null },
        });
      }
    }

    // What is left in the sprint is what was finished, and it now reads as
    // Completed rather than Done — the sprint's own state, shown on the task.
    // Completed is terminal on its own; shipping it is the client's optional
    // acceptance and never happens automatically.
    await projectSprintOntoTasks(tx, {
      sprintId,
      sprintName: existing.name,
      status,
      actorId: user.id,
      reason: `${existing.name} completed`,
    });

    return updated;
  });

  revalidatePath(`/dashboard/projects/${existing.projectId}`);
  await announceSprintNoteToChat({
    projectId: existing.projectId,
    sprintId,
    card: "SPRINT_REVIEW",
  });
  await publish(projectChannel(existing.projectId), {
    type: "sprint.status-changed",
    sprintId,
    status,
  });
  return serializeSprint(sprint, reviewDateIso ?? null);
}

export async function deleteSprint(
  sprintId: string,
  confirmName: string,
): Promise<{ id: string; projectId: string }> {
  const existing = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!existing) throw new Error("Sprint not found");
  const { user } = await requireSprintAction(existing.projectId, "delete");
  if (confirmName.trim() !== existing.name) {
    throw new Error(`Type "${existing.name}" exactly to delete it`);
  }

  await prisma.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({
      where: { sprintId },
      select: { id: true, stage: true, assigneeId: true },
    });

    await tx.task.updateMany({
      where: { sprintId },
      data: {
        stage: "BACKLOG",
        assigneeId: null,
        unplannedInSprint: false,
        unplannedReason: null,
      },
    });

    // Set explicitly rather than leaning on the FK's SetNull, which would drop
    // the sprint link while leaving the task parked in a work stage it can no
    // longer be in — and would record nothing.
    await applyBulkStageChange(tx, {
      tasks,
      toStage: "BACKLOG",
      actorId: user.id,
      source: "SPRINT_UNSCHEDULE",
      reason: `Sprint "${existing.name}" was deleted`,
      sprintId,
      sprintName: existing.name,
    });

    await tx.sprint.delete({ where: { id: sprintId } });
  });
  revalidatePath(`/dashboard/projects/${existing.projectId}`);
  return { id: existing.id, projectId: existing.projectId };
}

/**
 * Move a task into a sprint, out of one, or between two.
 *
 * `reason` is what somebody typed to explain a scope change on a sprint that
 * had already started, and it is required for one: the sprint document reports
 * what was added and dropped after the team committed, and an entry there with
 * no explanation is the thing this is meant to prevent. Planning moves, where
 * nothing has been committed to yet, ask for nothing.
 */
export async function setTaskSprint(
  taskId: string,
  sprintId: string | null,
  estimatedMinutes?: number | null,
  reason?: string,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      archivedAt: true,
      assigneeId: true,
      assignee: { select: { name: true, imageUrl: true } },
      // Read before the update, because this is the state that gets recorded
      // against the sprint the task is leaving.
      stage: true,
      estimatedMinutes: true,
      unplannedInSprint: true,
      unplannedReason: true,
      sprintId: true,
      // Named on the scope-change card, which announces the move to the project
      // and the client.
      title: true,
      taskType: true,
      taskNumber: true,
      sprint: { select: { name: true, status: true } },
    },
  });
  if (!task || task.archivedAt) throw new Error("Task not found");
  const { user } = await requireSprintEditor(task.projectId);

  let sprintStatus: string | null = null;
  let sprintName: string | null = null;
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
    sprintName = sprint.name;
  }

  // A task carries only one sprint, so reassigning it used to erase the fact
  // that it had ever been in the previous one: the task's Sprints History
  // showed the new name instead of both. Ending a sprint records a snapshot for
  // everything still in it, and leaving one early is recorded here, so the two
  // ways a task can part from a sprint both leave a trace.
  const leaving = sprintDepartureToRecord(
    { sprintId: task.sprintId, status: task.sprint?.status ?? null },
    sprintId,
  );

  // A sprint that has started has been committed to, so both directions of a
  // scope change have to be accounted for. Refused rather than defaulted: a
  // placeholder in the document would read like an explanation.
  const trimmedReason = reason?.trim() ?? "";
  const leavingStarted = task.sprint?.status === "ACTIVE";
  const joiningStarted = sprintStatus === "ACTIVE";
  if (
    moveNeedsReason({
      fromSprintStatus: task.sprint?.status ?? null,
      toSprintStatus: sprintStatus,
    }) &&
    !trimmedReason
  ) {
    throw new Error(
      leavingStarted
        ? "Say why this is being taken out of the sprint."
        : "Say why this is being added to a sprint already running.",
    );
  }

  const departure = {
    // The one moment this is knowable. Afterwards the sprint may have closed,
    // and a closing snapshot looks the same as this one.
    departedAfterStart: leavingStarted,
    stage: task.stage,
    estimatedMinutes: task.estimatedMinutes,
    unplannedInSprint: task.unplannedInSprint,
    unplannedReason: task.unplannedReason,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    assigneeImageUrl: task.assignee?.imageUrl ?? null,
    // Explains the task in that sprint's review, which would otherwise list it
    // as unfinished with no reason given.
    incompleteReason: leavingStarted
      ? trimmedReason
      : sprintId
        ? `Moved to ${sprintName ?? "another sprint"}`
        : "Removed from the sprint",
  };

  // Scheduling a task is what puts it in Planned or Next; unscheduling returns
  // it to Backlog. Both used to land on BACKLOG regardless, which is why a task
  // sitting in next month's sprint still showed as backlog everywhere.
  const targetStage = stageForSprintStatus(sprintStatus) ?? "TODO";

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.task.update({
      where: { id: taskId },
      data: {
        sprintId,
        stage: targetStage,
        ...(sprintId
          ? {
              unplannedInSprint: joiningStarted,
              unplannedReason: joiningStarted ? trimmedReason : null,
              ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
            }
          : {
              assigneeId: null,
              estimatedMinutes: null,
              unplannedInSprint: false,
              unplannedReason: null,
            }),
      },
      select: {
        id: true,
        sprintId: true,
        assigneeId: true,
        sprint: { select: { id: true, name: true, status: true } },
      },
    });

    await applyStageChange(tx, {
      taskId: task.id,
      fromStage: task.stage,
      toStage: targetStage,
      actorId: user.id,
      source: sprintId ? "SPRINT_SCHEDULE" : "SPRINT_UNSCHEDULE",
      reason: sprintId
        ? `Scheduled into ${sprintName ?? "a sprint"}`
        : `Removed from ${task.sprint?.name ?? "the sprint"}`,
      sprintId,
      sprintName,
      assigneeId: next.assigneeId,
    });

    // Upsert, not create: a task can leave the same sprint more than once, and
    // the latest departure is the one worth keeping.
    if (leaving) {
      await tx.sprintTaskSnapshot.upsert({
        where: { sprintId_taskId: { sprintId: leaving, taskId } },
        create: { sprintId: leaving, taskId, ...departure },
        update: departure,
      });
    }

    // The Decision and Risk were agreed for this task in that sprint. It is no
    // longer in it, so they no longer describe anything. The board warns before
    // getting here, so this is a confirmed discard rather than a silent one.
    if (task.sprintId && task.sprintId !== sprintId) {
      await tx.sprintTaskPlan.deleteMany({ where: { sprintId: task.sprintId, taskId } });
    }

    // A task that comes back to a sprint it had left is in that sprint now, so
    // the record of it leaving is no longer history — and left in place it would
    // be counted a second time in the task's sprint tally, which adds the
    // current sprint to the snapshot count. Only ever an open sprint here: a
    // closed one is refused above, so no ended sprint's record is at risk.
    if (sprintId) {
      await tx.sprintTaskSnapshot.deleteMany({ where: { sprintId, taskId } });
    }

    return next;
  });

  // Scheduling was previously invisible: the only trace of a task joining or
  // leaving a sprint was its stage moving, so nobody could be asked why a piece
  // of work was pulled out of a sprint.
  await logTaskActivity({
    taskId: task.id,
    userId: user.id,
    action: sprintId ? "scheduled" : "unscheduled",
    field: "sprint",
    oldValue: task.sprint?.name ?? null,
    newValue: sprintName,
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
  // Always sent, not only on removal: a move between two sprints changes the
  // task list of both, and an open planning document for the sprint being left
  // needs to hear about it to drop the row.
  await publish(projectChannel(task.projectId), {
    type: sprintId ? "sprint.task-assigned" : "sprint.task-removed",
    taskId: updated.id,
    sprintId: sprintId ?? undefined,
    previousSprintId: task.sprintId ?? undefined,
  });

  // Only a running sprint's scope is worth announcing: before it starts the
  // plan is still being written, and moving work around is the writing. A move
  // between two started sprints is both an exit and an entrance, so it is
  // announced against each of them. Never let this take the move down with it —
  // the scope change is already recorded whether or not chat hears about it.
  if (leavingStarted || joiningStarted) {
    const moved = { code: taskCode(task.taskType, task.taskNumber), title: task.title };
    try {
      if (leavingStarted && task.sprintId) {
        await announceSprintScopeChangeToChat({
          projectId: task.projectId,
          sprintId: task.sprintId,
          direction: "removed",
          task: moved,
          reason: trimmedReason,
        });
      }
      if (joiningStarted && sprintId) {
        await announceSprintScopeChangeToChat({
          projectId: task.projectId,
          sprintId,
          direction: "added",
          task: moved,
          reason: trimmedReason,
        });
      }
    } catch (err) {
      console.error("[sprint scope chat]", err);
    }
  }

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
  priority: TaskPriorityId;
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
          // Live, not frozen: the snapshot records how the sprint went, but
          // priority is a statement about the task now.
          priority: true,
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
      priority: snap.task.priority,
      estimatedMinutes: snap.estimatedMinutes,
      incompleteReason: snap.incompleteReason,
      assignee: frozenAssignee,
    };
    (result[snap.sprintId] ??= []).push(entry);
  }
  return result;
}

/**
 * Which tasks already have a Decision or a Risk written, keyed `sprintId:taskId`.
 *
 * The roadmap needs this to warn before a drag throws that text away. It reports
 * only whether each field is filled, because that is all the warning turns on
 * and the text itself belongs to the planning document.
 */
export async function getSprintPlanFlags(
  projectId: string,
): Promise<Record<string, { decision: boolean; risk: boolean }>> {
  await requireProjectMember(projectId);

  const plans = await prisma.sprintTaskPlan.findMany({
    where: {
      sprint: { projectId, status: { in: ["PLANNED", "NEXT", "ACTIVE"] } },
      OR: [{ decision: { not: "" } }, { risk: { not: "" } }],
    },
    select: { sprintId: true, taskId: true, decision: true, risk: true },
  });

  const flags: Record<string, { decision: boolean; risk: boolean }> = {};
  for (const plan of plans) {
    flags[`${plan.sprintId}:${plan.taskId}`] = {
      decision: plan.decision.trim().length > 0,
      risk: plan.risk.trim().length > 0,
    };
  }
  return flags;
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
  const { user } = await requireProjectMember(sprint.projectId);

  // Every client-facing sprint surface passes hideAssignees, so the client's
  // browser has no use for these — and the alias mechanism exists precisely to
  // keep real staff names off client screens. Hidden in the UI is not the same
  // as absent from the response, so they are dropped here instead.
  const hideStaff = isClientUser(user);

  const otherActive = await prisma.sprint.findFirst({
    where: { projectId: sprint.projectId, status: "ACTIVE", id: { not: sprintId } },
    select: { name: true },
  });

  const [questions, plans] = await Promise.all([
    prisma.defaultQuestion.findMany({ orderBy: { order: "asc" } }),
    prisma.sprintTaskPlan.findMany({
      where: { sprintId },
      select: { taskId: true, decision: true, risk: true },
    }),
  ]);
  const planByTask = new Map(plans.map((p) => [p.taskId, p]));

  const tasks: SprintPlanningTask[] = sprint.tasks.map((task) => {
    const answerByQuestion = new Map(task.answers.map((a) => [a.questionId, a.answer]));
    const typed = questions.filter((q) => q.taskType === task.taskType && !isBuiltInTaskFieldQuestion(q.question));
    const plan = planByTask.get(task.id);
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
      assignee: hideStaff ? null : task.assignee,
      unplanned: task.unplannedInSprint,
      unplannedReason: task.unplannedReason,
      // Absent row means nothing has been written yet, which reads the same as
      // empty. The block upserts on first keystroke.
      decision: plan?.decision ?? "",
      risk: plan?.risk ?? "",
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
        where: {
          projectId: task.projectId,
          userId: data.assigneeId,
          role: { not: "CLIENT" },
          user: { systemRole: { not: "CLIENT" } },
          NOT: { projectRole: { isClient: true } },
        },
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

/**
 * Persist the Decision or Risk agreed for one task in one sprint.
 *
 * Only the field that was edited is written, so two people working on the same
 * task's two fields do not overwrite each other the way the old document
 * attributes did.
 */
export async function updateSprintTaskPlan(data: {
  sprintId: string;
  taskId: string;
  decision?: string;
  risk?: string;
}): Promise<{ decision: string; risk: string }> {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: { id: true, projectId: true, archivedAt: true, sprintId: true },
  });
  if (!task || task.archivedAt) throw new Error("Task not found");
  if (task.sprintId !== data.sprintId) {
    throw new Error("That task is no longer in this sprint");
  }

  const { perms } = await requireSprintEditor(task.projectId);
  const sprint = await prisma.sprint.findUnique({
    where: { id: data.sprintId },
    select: { status: true, projectId: true },
  });
  if (!sprint || sprint.projectId !== task.projectId) throw new Error("Sprint not found");
  assertCanEditStartedPlanning(perms.isAdmin, sprint.status);

  const decision = data.decision?.trim();
  const risk = data.risk?.trim();

  const plan = await prisma.sprintTaskPlan.upsert({
    where: { sprintId_taskId: { sprintId: data.sprintId, taskId: data.taskId } },
    create: {
      sprintId: data.sprintId,
      taskId: data.taskId,
      decision: decision ?? "",
      risk: risk ?? "",
    },
    update: {
      ...(decision !== undefined ? { decision } : {}),
      ...(risk !== undefined ? { risk } : {}),
    },
    select: { decision: true, risk: true },
  });

  await publish(projectChannel(task.projectId), {
    type: "sprint.task-plan-changed",
    sprintId: data.sprintId,
    taskId: data.taskId,
  });

  return plan;
}

const PROOF_SELECT = {
  id: true,
  createdAt: true,
  bypassedAt: true,
  bypassedBy: { select: { name: true } },
  videos: {
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, url: true, fileSize: true },
  },
} as const;

type ProofRow = {
  id: string;
  createdAt: Date;
  bypassedAt: Date | null;
  bypassedBy: { name: string | null } | null;
  videos: { id: string; filename: string; url: string; fileSize: number | null }[];
};

function toSprintProof(proof: ProofRow, hideStaff: boolean): SprintTaskProof {
  const capturedAtIso = proof.createdAt.toISOString();
  return {
    id: proof.id,
    capturedAtIso,
    videos: proof.videos.map((video) => ({ ...video, createdAt: capturedAtIso })),
    bypassedByName: proof.bypassedAt ? (hideStaff ? null : (proof.bypassedBy?.name ?? null)) : null,
    bypassedAtIso: proof.bypassedAt?.toISOString() ?? null,
  };
}

/**
 * The proof behind each delivered task in this sprint, keyed by task.
 *
 * While the sprint runs this is the task's latest proof, which is the one that
 * got it through review and therefore the one that delivered it. Once the
 * sprint closes it is whatever was pinned to the snapshot at that moment, so
 * re-proving a task in a later sprint cannot quietly restate what an earlier
 * sprint shipped.
 *
 * Clients see the videos — the sprint document is what they are asked to
 * approve, and this is the evidence behind it — but not the names of the staff
 * who recorded them, which they see as aliases everywhere else.
 */
export async function getSprintProofOfWork(
  sprintId: string,
): Promise<Record<string, SprintTaskProof>> {
  const hideStaff = isClientUser(await requireUser());
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { status: true },
  });
  if (!sprint) return {};

  const byTask: Record<string, SprintTaskProof> = {};

  if (isClosedSprint(sprint.status)) {
    const pinned = await prisma.sprintTaskSnapshot.findMany({
      where: { sprintId, proofOfWorkId: { not: null } },
      select: { taskId: true, proofOfWork: { select: PROOF_SELECT } },
    });
    for (const snap of pinned) {
      if (snap.proofOfWork) byTask[snap.taskId] = toSprintProof(snap.proofOfWork, hideStaff);
    }
    return byTask;
  }

  const delivered = await prisma.task.findMany({
    where: { sprintId, archivedAt: null },
    select: { id: true, stage: true },
  });
  const taskIds = delivered.filter((t) => isProofApprovedStage(t.stage)).map((t) => t.id);
  if (taskIds.length === 0) return byTask;

  // Newest first, so the first row seen for a task is its current proof.
  const proofs = await prisma.proofOfWork.findMany({
    where: { taskId: { in: taskIds } },
    orderBy: { createdAt: "desc" },
    select: { ...PROOF_SELECT, taskId: true },
  });
  for (const proof of proofs) {
    if (!byTask[proof.taskId]) byTask[proof.taskId] = toSprintProof(proof, hideStaff);
  }
  return byTask;
}

/**
 * The work that left this sprint after it started, with the reason given at the
 * time and where it went.
 *
 * Read from the departure snapshots rather than by diffing the document's
 * committed list against the sprint's current tasks. The diff cannot see a task
 * that was pulled in mid-sprint and then dropped again — it was never in the
 * committed list and is not in the sprint now, so it falls through both sides
 * and vanishes from the record entirely. A departure always writes a snapshot,
 * so this catches every one.
 */
export async function getSprintRemovedTasks(sprintId: string): Promise<SprintRemovedTask[]> {
  const hideStaff = isClientUser(await requireUser());
  const snapshots = await prisma.sprintTaskSnapshot.findMany({
    where: { sprintId, departedAfterStart: true },
    select: {
      taskId: true,
      stage: true,
      estimatedMinutes: true,
      incompleteReason: true,
      unplannedReason: true,
      assigneeName: true,
      assigneeImageUrl: true,
      task: {
        select: {
          id: true,
          title: true,
          taskType: true,
          taskNumber: true,
          sprintId: true,
          archivedAt: true,
          assignee: { select: { id: true, name: true, imageUrl: true } },
          sprint: { select: { name: true } },
          _count: { select: { sprintSnapshots: true } },
        },
      },
    },
  });

  return snapshots
    // A task dragged out and then put back is not a departure any more.
    .filter((snap) => snap.task.sprintId !== sprintId)
    .map((snap) => ({
      task: {
        id: snap.task.id,
        code: taskCode(snap.task.taskType, snap.task.taskNumber),
        title: snap.task.title,
        taskType: snap.task.taskType,
        stage: snap.stage,
        estimatedMinutes: snap.estimatedMinutes,
        sprintCount: snap.task._count.sprintSnapshots ?? 0,
        assignee:
          !hideStaff && (snap.assigneeName || snap.task.assignee)
            ? {
                id: snap.task.assignee?.id,
                name: snap.assigneeName ?? snap.task.assignee?.name ?? null,
                imageUrl: snap.assigneeImageUrl ?? snap.task.assignee?.imageUrl ?? null,
              }
            : null,
        unplannedReason: snap.unplannedReason,
        questions: [],
      },
      // Departures from before the board started asking carry a placeholder,
      // which under a "Reason for removing" label just says it again.
      reason:
        snap.incompleteReason && snap.incompleteReason !== "Removed from the sprint"
          ? snap.incompleteReason
          : "",
      movedTo: snap.task.archivedAt ? null : (snap.task.sprint?.name ?? null),
      wasCompleted: snap.stage === "DONE",
    }));
}

export async function getSprintReviewTasks(sprintId: string): Promise<{
  sprintName: string;
  status: string;
  completed: SprintPlanningTask[];
  incomplete: SprintPlanningTask[];
  info: SprintPlanningInfo;
  /** The work that left the sprint after it started, and why. */
  removed: SprintRemovedTask[];
}> {
  // getSprintPlanningTasks already proved membership and dropped assignees for
  // a client; the snapshot branch below builds its own rows and has to repeat
  // that, since a snapshot carries the name frozen at sprint close.
  const planning = await getSprintPlanningTasks(sprintId);
  const hideStaff = isClientUser(await requireUser());

  if (isClosedSprint(planning.status)) {
    const [snapshots, questions, plans] = await Promise.all([
      prisma.sprintTaskSnapshot.findMany({
        where: { sprintId },
        select: {
          stage: true,
          estimatedMinutes: true,
          assigneeName: true,
          assigneeImageUrl: true,
          unplannedInSprint: true,
          unplannedReason: true,
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
      // Outlives the sprint, and the outcome shows what each task was committed
      // to alongside how it turned out.
      prisma.sprintTaskPlan.findMany({
        where: { sprintId },
        select: { taskId: true, decision: true, risk: true },
      }),
    ]);
    const planByTask = new Map(plans.map((p) => [p.taskId, p]));
    const mapped: SprintPlanningTask[] = snapshots.map((snap) => {
      const answerByQuestion = new Map(snap.task.answers.map((a) => [a.questionId, a.answer]));
      const plan = planByTask.get(snap.task.id);
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
          !hideStaff && (snap.assigneeName || snap.task.assignee)
            ? {
                id: snap.task.assignee?.id,
                name: snap.assigneeName ?? snap.task.assignee?.name ?? null,
                imageUrl: snap.assigneeImageUrl ?? snap.task.assignee?.imageUrl ?? null,
              }
            : null,
        unplanned: snap.unplannedInSprint,
        unplannedReason: snap.unplannedReason,
        decision: plan?.decision ?? "",
        risk: plan?.risk ?? "",
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
      info: { ...planning.info, locked: true },
      removed: await getSprintRemovedTasks(sprintId),
    };
  }

  return {
    sprintName: planning.sprintName,
    status: planning.status,
    completed: planning.tasks.filter((task) => task.stage === "DONE"),
    incomplete: planning.tasks.filter((task) => task.stage !== "DONE"),
    info: { ...planning.info, locked: true },
    removed: await getSprintRemovedTasks(sprintId),
  };
}
