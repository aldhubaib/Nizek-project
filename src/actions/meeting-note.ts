"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireProjectRole } from "@/lib/auth";
import {
  canSprint,
  getAdminPermissions,
  getPermissionsFromRole,
} from "@/lib/permissions";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { isDeadlineTestProjectByName } from "@/lib/deadline-reminders";
import { logTaskActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";
import { createTask } from "@/actions/task";
import type { TaskPriorityId } from "@/lib/task-label";
import { sendMessage } from "@/actions/messages";
import { applyStoredAnnotationMarks, plainTextExcerpt, taskMarkTag, wrapFirstPlainText } from "@/lib/html-annotate";
import { diffNoteParagraphs, encodeContentDiff } from "@/lib/note-content-diff";
import { encodeNoteActivityBody } from "@/lib/note-activity-payload";
import { ALL_MENTION_TOKEN } from "@/lib/mentions";
import {
  ROADMAP_NEXT_FULL_ERROR,
  ROADMAP_NEXT_MAX,
  isRoadmapStatus,
  normalizeRoadmapStatus,
  roadmapCreateTaskError,
  roadmapScheduleError,
  type RoadmapStatus,
} from "@/lib/roadmap-status";
import { addWorkingDays, parseWorkingDays, startOfLocalDay, parseDateInputValue, toDateInputValue } from "@/lib/working-days";
import { sprintDocTitle, sprintIdFromPlanningHtml } from "@/lib/sprint-planning-doc";

export async function createMeetingNote(data: {
  projectId: string;
  title: string;
  content: string;
  date: string;
  noteType?: "MEETING_NOTE" | "DECISION" | "CLARIFICATION" | "DEADLINE" | "SPRINT_PLANNING" | "SPRINT_REVIEW" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
  dueDate?: string;
  taskId?: string;
  roadmapStatus?: RoadmapStatus;
  workingDays?: number | string | null;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create notes");

  if (data.noteType === "SPRINT_PLANNING" || data.noteType === "SPRINT_REVIEW") {
    const perms =
      user.systemRole === "ADMIN"
        ? getAdminPermissions()
        : getPermissionsFromRole(member.projectRole);
    if (data.noteType === "SPRINT_PLANNING" && !canSprint(perms, "createPlanning")) {
      throw new Error("You do not have permission to create sprint planning");
    }
    if (data.noteType === "SPRINT_REVIEW" && !canSprint(perms, "end")) {
      throw new Error("You do not have permission to create a sprint review");
    }
  }

  const workingDays =
    data.noteType === "DEADLINE" ? parseWorkingDays(data.workingDays) : null;

  const roadmapStatus =
    data.noteType === "DEADLINE" && data.roadmapStatus && isRoadmapStatus(data.roadmapStatus)
      ? data.roadmapStatus
      : "PLANNED";

  if (data.noteType === "DEADLINE") {
    if (roadmapStatus === "NEXT") {
      const nextCount = await prisma.meetingNote.count({
        where: {
          projectId: data.projectId,
          noteType: "DEADLINE",
          roadmapStatus: "NEXT",
        },
      });
      if (nextCount >= ROADMAP_NEXT_MAX) {
        throw new Error(ROADMAP_NEXT_FULL_ERROR);
      }
    }
    const scheduleError = roadmapScheduleError(
      roadmapStatus,
      data.dueDate || null,
      workingDays,
    );
    if (scheduleError) throw new Error(scheduleError);
  }

  const note = await prisma.meetingNote.create({
    data: {
      title: data.title,
      content: data.content,
      date: new Date(data.date),
      noteType: data.noteType ?? "MEETING_NOTE",
      projectId: data.projectId,
      authorId: user.id,
      roadmapStatus,
      ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
      ...(workingDays != null && { workingDays }),
      ...(data.taskId && { taskId: data.taskId }),
      ...(roadmapStatus === "SHIPPED" ? { completedAt: new Date() } : {}),
    },
  });

  if (data.taskId) {
    await prisma.noteTaskLink.create({
      data: {
        noteId: note.id,
        taskId: data.taskId,
        createdById: user.id,
      },
    });
    await logTaskActivity({
      taskId: data.taskId,
      userId: user.id,
      action: "note_created",
      field: "note",
      newValue: data.title,
    });
  }

  revalidatePath(`/dashboard/projects/${data.projectId}`);
  if (note.noteType !== "SPRINT_PLANNING" && note.noteType !== "SPRINT_REVIEW") {
    await postNoteActivityToChat({
      projectId: data.projectId,
      noteId: note.id,
      noteTitle: note.title,
      noteType: note.noteType,
      action: "created",
      excerpt: plainTextExcerpt(note.content),
    });
  }
  return note;
}

export async function toggleDeadlineComplete(
  noteId: string,
): Promise<{ completedAt: Date | null; roadmapStatus: RoadmapStatus }> {
  const note = await prisma.meetingNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Note not found");
  if (note.noteType !== "DEADLINE") throw new Error("Not a roadmap item");

  await requireProjectMember(note.projectId);

  const completedAt = note.completedAt ? null : new Date();
  const roadmapStatus: RoadmapStatus = completedAt ? "SHIPPED" : "PLANNED";
  if (completedAt) {
    const scheduleError = roadmapScheduleError(
      "SHIPPED",
      note.dueDate,
      note.workingDays,
    );
    if (scheduleError) throw new Error(scheduleError);
  }
  await prisma.meetingNote.update({
    where: { id: noteId },
    data: { completedAt, roadmapStatus },
  });

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  return { completedAt, roadmapStatus };
}

export async function updateRoadmapStatus(
  noteId: string,
  status: RoadmapStatus,
): Promise<{
  roadmapStatus: RoadmapStatus;
  completedAt: Date | null;
  dueDate: Date | null;
  startedAt: Date | null;
}> {
  if (!isRoadmapStatus(status)) throw new Error("Invalid roadmap status");

  const note = await prisma.meetingNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Note not found");
  if (note.noteType !== "DEADLINE") throw new Error("Not a roadmap item");

  const { user, member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot edit notes");

  if (status === "NEXT" && note.roadmapStatus !== "NEXT") {
    const nextCount = await prisma.meetingNote.count({
      where: {
        projectId: note.projectId,
        noteType: "DEADLINE",
        roadmapStatus: "NEXT",
      },
    });
    if (nextCount >= ROADMAP_NEXT_MAX) {
      throw new Error(ROADMAP_NEXT_FULL_ERROR);
    }
  }

  const enteringProgress = status === "PROGRESS" && note.roadmapStatus !== "PROGRESS";
  const startedAt = enteringProgress ? startOfLocalDay() : note.startedAt;
  const dueDate =
    enteringProgress && note.workingDays != null
      ? addWorkingDays(startedAt ?? startOfLocalDay(), note.workingDays)
      : note.dueDate;

  const scheduleError = roadmapScheduleError(
    status,
    dueDate,
    note.workingDays,
  );
  if (scheduleError) throw new Error(scheduleError);

  const completedAt =
    status === "SHIPPED" ? note.completedAt ?? new Date() : null;

  const historyEntries: {
    noteId: string;
    userId: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }[] = [];

  if (note.roadmapStatus !== status) {
    historyEntries.push({
      noteId: note.id,
      userId: user.id,
      field: "roadmapStatus",
      oldValue: note.roadmapStatus,
      newValue: status,
    });
  }

  const oldDue = note.dueDate ? note.dueDate.toISOString() : null;
  const newDue = dueDate ? dueDate.toISOString() : null;
  if (oldDue !== newDue) {
    historyEntries.push({
      noteId: note.id,
      userId: user.id,
      field: "dueDate",
      oldValue: note.dueDate ? note.dueDate.toISOString().slice(0, 10) : null,
      newValue: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    });
  }

  const oldStart = note.startedAt ? note.startedAt.toISOString() : null;
  const newStart = startedAt ? startedAt.toISOString() : null;
  if (oldStart !== newStart) {
    historyEntries.push({
      noteId: note.id,
      userId: user.id,
      field: "startedAt",
      oldValue: note.startedAt ? toDateInputValue(note.startedAt) : null,
      newValue: startedAt ? toDateInputValue(startedAt) : null,
    });
  }

  await prisma.$transaction([
    prisma.meetingNote.update({
      where: { id: noteId },
      data: { roadmapStatus: status, completedAt, dueDate, startedAt },
    }),
    ...(historyEntries.length > 0
      ? [prisma.noteHistory.createMany({ data: historyEntries })]
      : []),
  ]);

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  return { roadmapStatus: status, completedAt, dueDate, startedAt };
}

export async function updateMeetingNote(data: {
  noteId: string;
  title?: string;
  content?: string;
  date?: string;
  dueDate?: string | null;
  startedAt?: string | null;
  workingDays?: number | string | null;
  /** Highlight marks only — don't write a history row. */
  skipHistory?: boolean;
}) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: data.noteId },
    include: { project: true },
  });
  if (!note) throw new Error("Note not found");

  const { user, member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot edit notes");

  if (note.noteType === "SPRINT_PLANNING" || note.noteType === "SPRINT_REVIEW") {
    const perms =
      user.systemRole === "ADMIN"
        ? getAdminPermissions()
        : getPermissionsFromRole(member.projectRole);
    if (note.noteType === "SPRINT_PLANNING" && !canSprint(perms, "createPlanning")) {
      throw new Error("You do not have permission to edit sprint planning");
    }
    if (note.noteType === "SPRINT_REVIEW" && !canSprint(perms, "end")) {
      throw new Error("You do not have permission to edit a sprint review");
    }
  }

  if (note.noteType === "SPRINT_PLANNING") {
    const sprintId = sprintIdFromPlanningHtml(data.content ?? note.content);
    if (sprintId) {
      const sprint = await prisma.sprint.findUnique({
        where: { id: sprintId },
        select: { status: true },
      });
      const perms =
        user.systemRole === "ADMIN"
          ? getAdminPermissions()
          : getPermissionsFromRole(member.projectRole);
      if (sprint && sprint.status !== "PLANNED" && sprint.status !== "NEXT" && !perms.isAdmin) {
        throw new Error("Sprint planning is locked after the sprint starts. Only an admin can edit it.");
      }
    }
  }

  const historyEntries: { field: string; oldValue: string | null; newValue: string | null; noteId: string; userId: string }[] = [];

  if (data.skipHistory) {
    if (note.noteType === "DEADLINE") {
      const scheduleError = roadmapScheduleError(
        note.roadmapStatus,
        data.dueDate !== undefined
          ? data.dueDate
            ? new Date(data.dueDate)
            : null
          : note.dueDate,
        data.workingDays !== undefined
          ? parseWorkingDays(data.workingDays)
          : note.workingDays,
      );
      if (scheduleError) throw new Error(scheduleError);
    }
    const updated = await prisma.meetingNote.update({
      where: { id: data.noteId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.dueDate !== undefined && {
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        }),
        ...(data.startedAt !== undefined && {
          startedAt: data.startedAt ? parseDateInputValue(data.startedAt) : null,
        }),
        ...(data.workingDays !== undefined && {
          workingDays: parseWorkingDays(data.workingDays),
        }),
      },
    });
    if (
      data.title &&
      (note.noteType === "SPRINT_PLANNING" || note.noteType === "SPRINT_REVIEW")
    ) {
      await syncSprintDocPeerTitle(
        note.projectId,
        data.content ?? note.content,
        note.noteType,
        data.title,
      );
    }
    revalidatePath(`/dashboard/projects/${note.projectId}`);
    return updated;
  }

  if (data.title && data.title !== note.title) {
    historyEntries.push({
      field: "title",
      oldValue: note.title,
      newValue: data.title,
      noteId: note.id,
      userId: user.id,
    });
  }

  if (data.content !== undefined && data.content !== note.content) {
    const changes = diffNoteParagraphs(note.content, data.content);
    if (changes.length > 0) {
      historyEntries.push({
        field: "content",
        oldValue: changes.length === 1 ? (changes[0].before ?? null) : `${changes.length} paragraph${changes.length === 1 ? "" : "s"}`,
        newValue: encodeContentDiff(changes),
        noteId: note.id,
        userId: user.id,
      });
    }
  }

  const nextDueDate =
    data.dueDate !== undefined
      ? data.dueDate
        ? new Date(data.dueDate)
        : null
      : undefined;
  if (nextDueDate !== undefined) {
    const oldIso = note.dueDate ? note.dueDate.toISOString().slice(0, 10) : null;
    const newIso = nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null;
    if (oldIso !== newIso) {
      historyEntries.push({
        field: "dueDate",
        oldValue: oldIso,
        newValue: newIso,
        noteId: note.id,
        userId: user.id,
      });
    }
  }

  const nextStartedAt =
    data.startedAt !== undefined
      ? data.startedAt
        ? parseDateInputValue(data.startedAt)
        : null
      : undefined;
  if (nextStartedAt !== undefined) {
    const oldIso = note.startedAt ? toDateInputValue(note.startedAt) : null;
    const newIso = nextStartedAt ? toDateInputValue(nextStartedAt) : null;
    if (oldIso !== newIso) {
      historyEntries.push({
        field: "startedAt",
        oldValue: oldIso,
        newValue: newIso,
        noteId: note.id,
        userId: user.id,
      });
    }
  }

  const nextWorkingDays =
    data.workingDays !== undefined ? parseWorkingDays(data.workingDays) : undefined;
  if (nextWorkingDays !== undefined && nextWorkingDays !== note.workingDays) {
    historyEntries.push({
      field: "workingDays",
      oldValue: note.workingDays != null ? String(note.workingDays) : null,
      newValue: nextWorkingDays != null ? String(nextWorkingDays) : null,
      noteId: note.id,
      userId: user.id,
    });
  }

  if (note.noteType === "DEADLINE") {
    const scheduleError = roadmapScheduleError(
      note.roadmapStatus,
      nextDueDate !== undefined ? nextDueDate : note.dueDate,
      nextWorkingDays !== undefined ? nextWorkingDays : note.workingDays,
    );
    if (scheduleError) throw new Error(scheduleError);
  }

  const [updated] = await prisma.$transaction([
    prisma.meetingNote.update({
      where: { id: data.noteId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.date && { date: new Date(data.date) }),
        ...(nextDueDate !== undefined && { dueDate: nextDueDate }),
        ...(nextStartedAt !== undefined && { startedAt: nextStartedAt }),
        ...(nextWorkingDays !== undefined && { workingDays: nextWorkingDays }),
      },
    }),
    ...(historyEntries.length > 0
      ? [prisma.noteHistory.createMany({ data: historyEntries })]
      : []),
  ]);

  if (
    data.title &&
    data.title !== note.title &&
    (note.noteType === "SPRINT_PLANNING" || note.noteType === "SPRINT_REVIEW")
  ) {
    await syncSprintDocPeerTitle(
      note.projectId,
      data.content ?? note.content,
      note.noteType,
      data.title,
    );
  }

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  if (historyEntries.length > 0) {
    await postNoteActivityToChat({
      projectId: note.projectId,
      noteId: note.id,
      noteTitle: data.title ?? note.title,
      noteType: note.noteType,
      action: "updated",
      fields: historyEntries.map((e) => e.field),
      excerpt: plainTextExcerpt(data.content ?? note.content),
    });
  }
  return updated;
}

export async function deleteMeetingNote(noteId: string) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    include: {
      project: true,
      commentThreads: { select: { conversationId: true } },
    },
  });
  if (!note) throw new Error("Note not found");

  await requireProjectRole(note.projectId, ["ADMIN", "PROJECT_MANAGER"]);

  const convoIds = note.commentThreads
    .map((t) => t.conversationId)
    .filter((id): id is string => Boolean(id));

  await prisma.meetingNote.delete({ where: { id: noteId } });
  if (convoIds.length > 0) {
    await prisma.conversation.deleteMany({ where: { id: { in: convoIds } } });
  }
  revalidatePath(`/dashboard/projects/${note.projectId}`);
}

const linkedTaskSelect = {
  id: true,
  title: true,
  taskNumber: true,
  taskType: true,
  projectId: true,
  stage: true,
} as const;

const noteActivityInclude = {
  author: true,
  task: { select: linkedTaskSelect },
  taskLinks: {
    include: {
      task: { select: linkedTaskSelect },
      createdBy: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: { createdAt: "desc" as const },
  },
  commentThreads: {
    select: {
      id: true,
      quoteText: true,
      conversationId: true,
      _count: { select: { comments: true } },
      subscribers: { select: { userId: true, understoodAt: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  history: {
    include: { user: true },
    orderBy: { createdAt: "desc" as const },
  },
  reminderLogs: {
    orderBy: { sentAt: "desc" as const },
  },
} as const;

function withAnnotationMarks<
  T extends {
    content: string;
    taskLinks: { taskId: string; quoteText?: string | null }[];
    commentThreads: { id: string; quoteText?: string | null }[];
  },
>(note: T): T {
  const content = applyStoredAnnotationMarks(
    note.content,
    note.taskLinks,
    note.commentThreads,
  );
  return content === note.content ? note : { ...note, content };
}

export async function getMeetingNotes(projectId: string) {
  await requireProjectMember(projectId);

  const notes = await prisma.meetingNote.findMany({
    where: { projectId },
    include: noteActivityInclude,
    orderBy: { date: "desc" },
  });
  const mapped = notes.map((note) => withAnnotationMarks(note));
  const dirty = mapped.filter((note, i) => note.content !== notes[i].content);
  if (dirty.length > 0) {
    await Promise.all(
      dirty.map((note) =>
        prisma.meetingNote.update({
          where: { id: note.id },
          data: { content: note.content },
        }),
      ),
    );
  }
  return mapped;
}

export async function getMeetingNote(noteId: string) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    include: noteActivityInclude,
  });
  if (!note) throw new Error("Note not found");

  await requireProjectMember(note.projectId);
  const next = withAnnotationMarks(note);
  if (next.content !== note.content) {
    await prisma.meetingNote.update({
      where: { id: note.id },
      data: { content: next.content },
    });
  }
  return next;
}

async function getSprintTypedNote(
  projectId: string,
  sprintId: string,
  noteType: "SPRINT_PLANNING" | "SPRINT_REVIEW",
) {
  await requireProjectMember(projectId);
  const notes = await prisma.meetingNote.findMany({
    where: { projectId, noteType },
    select: { id: true, title: true, content: true },
    orderBy: { createdAt: "desc" },
  });
  return notes.find((n) => n.content.includes(sprintId)) ?? null;
}

async function syncSprintDocPeerTitle(
  projectId: string,
  html: string,
  fromType: "SPRINT_PLANNING" | "SPRINT_REVIEW",
  title: string,
) {
  const sprintId = sprintIdFromPlanningHtml(html);
  if (!sprintId) return;
  const peerType = fromType === "SPRINT_PLANNING" ? "SPRINT_REVIEW" : "SPRINT_PLANNING";
  const peerTitle = sprintDocTitle(title, peerType === "SPRINT_REVIEW" ? "review" : "planning");
  const peer = await prisma.meetingNote.findMany({
    where: { projectId, noteType: peerType },
    select: { id: true, title: true, content: true },
  });
  const match = peer.find((n) => n.content.includes(sprintId));
  if (match && match.title !== peerTitle) {
    await prisma.meetingNote.update({
      where: { id: match.id },
      data: { title: peerTitle },
    });
  }
}

export async function getSprintPlanningNote(projectId: string, sprintId: string) {
  return getSprintTypedNote(projectId, sprintId, "SPRINT_PLANNING");
}

export async function getSprintReviewNote(projectId: string, sprintId: string) {
  return getSprintTypedNote(projectId, sprintId, "SPRINT_REVIEW");
}

/** Note plus the permissions needed to open it as a full workspace from chat. */
export async function getNoteWorkspace(noteId: string) {
  const note = await getMeetingNote(noteId);
  const { user, member } = await requireProjectMember(note.projectId);
  const project = await prisma.project.findUnique({
    where: { id: note.projectId },
    select: {
      name: true,
      contracts: {
        select: {
          id: true,
          contractType: true,
          label: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });
  if (!project) throw new Error("Project not found");

  const isSystemAdmin = user.systemRole === "ADMIN";
  const perms = isSystemAdmin
    ? getAdminPermissions()
    : getPermissionsFromRole(member.projectRole);
  const canEdit =
    member.role !== "CLIENT" && (perms.canModifyTask || perms.isAdmin);
  const activeContract = getActiveContract(project.contracts);
  const isActive = Boolean(activeContract);
  const allowedTaskTypes = activeContract
    ? getAllowedTaskTypes(activeContract.contractType, isSystemAdmin)
    : [];

  return {
    note,
    projectId: note.projectId,
    currentUserId: user.id,
    canEdit,
    canCreateTask:
      member.role !== "CLIENT" &&
      isActive &&
      (isSystemAdmin || perms.canCreateTask),
    allowedTaskTypes,
    activeContractType: activeContract?.contractType ?? null,
    isActive,
    isSystemAdmin,
    isDeadlineTestProject: isDeadlineTestProjectByName(project.name),
  };
}

export async function getTaskNotes(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) throw new Error("Task not found");

  await requireProjectMember(task.projectId);

  return prisma.meetingNote.findMany({
    where: {
      OR: [{ taskId }, { taskLinks: { some: { taskId } } }],
    },
    include: {
      author: true,
      history: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
      },
      reminderLogs: {
        orderBy: { sentAt: "desc" },
      },
      taskLinks: {
        include: {
          task: { select: linkedTaskSelect },
          createdBy: { select: { id: true, name: true, imageUrl: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

const TASK_NOTE_EXCLUDED: Array<"SPRINT_PLANNING" | "SPRINT_REVIEW" | "DEADLINE"> = [
  "SPRINT_PLANNING",
  "SPRINT_REVIEW",
  "DEADLINE",
];

/**
 * The one free-form note that belongs to a task. Reuses the oldest attached
 * write-up if it exists; otherwise creates an empty one (no chat ping).
 */
export async function getOrCreateTaskNote(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true },
  });
  if (!task) throw new Error("Task not found");

  const { user, member } = await requireProjectMember(task.projectId);

  const existing = await prisma.meetingNote.findFirst({
    where: {
      noteType: { notIn: TASK_NOTE_EXCLUDED },
      OR: [{ taskId }, { taskLinks: { some: { taskId } } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, content: true },
  });
  if (existing) return existing;
  if (member.role === "CLIENT") throw new Error("No note on this task");

  const note = await prisma.meetingNote.create({
    data: {
      title: task.title,
      content: "",
      date: new Date(),
      noteType: "MEETING_NOTE",
      projectId: task.projectId,
      authorId: user.id,
      taskId,
    },
    select: { id: true, title: true, content: true },
  });
  await prisma.noteTaskLink.create({
    data: { noteId: note.id, taskId, createdById: user.id },
  });
  return note;
}

/** @deprecated Prefer getMeetingNote for full timeline data. */
export async function getNoteHistory(noteId: string) {
  const note = await getMeetingNote(noteId);
  return note.history;
}

export async function annotateNoteContent(noteId: string, content: string) {
  return updateMeetingNote({ noteId, content, skipHistory: true });
}

export async function attachNoteToTask(data: {
  noteId: string;
  taskId: string;
  quoteText?: string;
}) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: data.noteId },
    select: { id: true, title: true, projectId: true },
  });
  if (!note) throw new Error("Note not found");

  const { user, member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot attach notes");

  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: { id: true, projectId: true, title: true, archivedAt: true },
  });
  if (!task || task.archivedAt) throw new Error("Task not found");
  if (task.projectId !== note.projectId) {
    throw new Error("Note and task must belong to the same project");
  }

  const link = await prisma.noteTaskLink.upsert({
    where: { noteId_taskId: { noteId: note.id, taskId: task.id } },
    create: {
      noteId: note.id,
      taskId: task.id,
      quoteText: data.quoteText ?? null,
      createdById: user.id,
    },
    update: {
      ...(data.quoteText !== undefined && { quoteText: data.quoteText }),
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          taskNumber: true,
          taskType: true,
          projectId: true,
        },
      },
    },
  });

  await logTaskActivity({
    taskId: task.id,
    userId: user.id,
    action: "note_attached",
    field: "note",
    newValue: note.title,
  });

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  return link;
}

export async function detachNoteFromTask(noteId: string, taskId: string) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: noteId },
    select: { projectId: true, taskId: true },
  });
  if (!note) throw new Error("Note not found");

  const { member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot detach notes");

  await prisma.noteTaskLink.deleteMany({ where: { noteId, taskId } });
  if (note.taskId === taskId) {
    await prisma.meetingNote.update({
      where: { id: noteId },
      data: { taskId: null },
    });
  }

  revalidatePath(`/dashboard/projects/${note.projectId}`);
}

export async function searchProjectTasksForLink(projectId: string, query = "") {
  await requireProjectMember(projectId);
  const q = query.trim();
  return prisma.task.findMany({
    where: {
      projectId,
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              ...(Number.isFinite(Number(q)) ? [{ taskNumber: Number(q) }] : []),
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      taskNumber: true,
      taskType: true,
      stage: true,
    },
    orderBy: { taskNumber: "desc" },
    take: 40,
  });
}

export async function searchProjectNotesForLink(
  projectId: string,
  taskId: string,
  query = "",
  opts?: { kind?: "notes" | "roadmap" },
) {
  await requireProjectMember(projectId);
  const q = query.trim();
  const kind = opts?.kind;
  return prisma.meetingNote.findMany({
    where: {
      projectId,
      // `NOT { taskId }` drops rows where taskId is null (SQL NULL). Include
      // unlinked notes explicitly, then skip ones already on this task.
      AND: [
        { OR: [{ taskId: null }, { taskId: { not: taskId } }] },
        { taskLinks: { none: { taskId } } },
      ],
      ...(kind === "roadmap" ? { noteType: "DEADLINE" } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      title: true,
      noteType: true,
      date: true,
      author: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 40,
  });
}

export async function createTaskFromNoteHighlight(data: {
  noteId: string;
  quoteText: string;
  title: string;
  description?: string;
  priority?: TaskPriorityId;
  taskType?: "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
  answers?: { questionId: string; answer: string }[];
}) {
  const note = await prisma.meetingNote.findUnique({
    where: { id: data.noteId },
    select: {
      id: true,
      title: true,
      content: true,
      projectId: true,
      noteType: true,
      roadmapStatus: true,
      completedAt: true,
    },
  });
  if (!note) throw new Error("Note not found");

  const { member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create tasks");

  if (note.noteType === "DEADLINE") {
    const status = normalizeRoadmapStatus(note.roadmapStatus, note.completedAt);
    const blocked = roadmapCreateTaskError(status);
    if (blocked) throw new Error(blocked);
  }

  const quote = data.quoteText.trim();

  const task = await createTask({
    projectId: note.projectId,
    title: data.title.trim(),
    description: data.description?.trim() || undefined,
    priority: data.priority,
    taskType: data.taskType,
    answers: data.answers,
  });

  await attachNoteToTask({
    noteId: note.id,
    taskId: task.id,
    quoteText: quote || undefined,
  });

  if (quote) {
    const mark = taskMarkTag(task.id);
    const next = wrapFirstPlainText(note.content, quote, mark.open, mark.close);
    if (next !== note.content) {
      await prisma.meetingNote.update({
        where: { id: note.id },
        data: { content: next },
      });
    }
  }

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  return task;
}

async function postNoteActivityToChat(payload: {
  projectId: string;
  noteId: string;
  noteTitle: string;
  noteType: string;
  action: "created" | "updated" | "published";
  fields?: string[];
  excerpt?: string;
  mentionAll?: boolean;
}) {
  const project = await prisma.project.findUnique({
    where: { id: payload.projectId },
    select: { name: true },
  });
  const encoded = encodeNoteActivityBody({
    projectId: payload.projectId,
    noteId: payload.noteId,
    projectName: project?.name,
    noteTitle: payload.noteTitle,
    noteType: payload.noteType,
    action: payload.action,
    fields: payload.fields,
    excerpt: payload.excerpt,
  });
  const sent = await sendMessage({
    projectId: payload.projectId,
    body: payload.mentionAll ? `${encoded}\n${ALL_MENTION_TOKEN}` : encoded,
    kind: "note_activity",
  });
  if (!sent.ok) {
    console.error("[note activity chat]", sent.error);
  }
}

export async function announceSprintNoteToChat(options: {
  projectId: string;
  sprintId: string;
  noteType: "SPRINT_PLANNING" | "SPRINT_REVIEW";
}) {
  const note = await getSprintTypedNote(options.projectId, options.sprintId, options.noteType);
  if (!note) return;
  await postNoteActivityToChat({
    projectId: options.projectId,
    noteId: note.id,
    noteTitle: note.title,
    noteType: options.noteType,
    action: "published",
    excerpt: plainTextExcerpt(note.content),
    mentionAll: true,
  });
}
