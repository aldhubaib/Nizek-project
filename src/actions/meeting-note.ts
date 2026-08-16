"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireProjectRole } from "@/lib/auth";
import {
  canCreateInStage,
  getAdminPermissions,
  getPermissionsFromRole,
} from "@/lib/permissions";
import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { isDeadlineTestProjectByName } from "@/lib/deadline-reminders";
import { logTaskActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";
import { createTask } from "@/actions/task";
import { sendMessage } from "@/actions/messages";
import { applyStoredAnnotationMarks, plainTextExcerpt, taskMarkTag, wrapFirstPlainText } from "@/lib/html-annotate";
import { diffNoteParagraphs, encodeContentDiff } from "@/lib/note-content-diff";
import { encodeNoteActivityBody } from "@/lib/note-activity-payload";
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

export async function createMeetingNote(data: {
  projectId: string;
  title: string;
  content: string;
  date: string;
  noteType?: "MEETING_NOTE" | "DECISION" | "CLARIFICATION" | "DEADLINE" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
  dueDate?: string;
  taskId?: string;
  roadmapStatus?: RoadmapStatus;
  workingDays?: number | string | null;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create notes");

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
  await postNoteActivityToChat({
    projectId: data.projectId,
    noteId: note.id,
    noteTitle: note.title,
    noteType: note.noteType,
    action: "created",
    excerpt: plainTextExcerpt(note.content),
  });
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
      (isSystemAdmin || canCreateInStage(perms, "NEW_REQUEST")),
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
      NOT: {
        OR: [{ taskId }, { taskLinks: { some: { taskId } } }],
      },
      ...(kind === "roadmap"
        ? { noteType: "DEADLINE" }
        : kind === "notes"
          ? { noteType: { not: "DEADLINE" } }
          : {}),
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
  priority?: number;
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
  const description = [
    data.description?.trim() || quote,
    "",
    `— From note "${note.title}"`,
  ]
    .filter((line, i, arr) => !(line === "" && i === arr.length - 1))
    .join("\n");

  const task = await createTask({
    projectId: note.projectId,
    title: data.title.trim(),
    description,
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
  action: "created" | "updated";
  fields?: string[];
  excerpt?: string;
}) {
  const sent = await sendMessage({
    projectId: payload.projectId,
    body: encodeNoteActivityBody(payload),
    kind: "note_activity",
  });
  if (!sent.ok) {
    console.error("[note activity chat]", sent.error);
  }
}
