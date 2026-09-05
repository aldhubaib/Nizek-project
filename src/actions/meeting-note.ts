"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireProjectRole, requireUser } from "@/lib/auth";
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
import {
  encodeNoteActivityBody,
  type NoteActivityPayload,
  SPRINT_TASK_ADDED,
  SPRINT_TASK_REMOVED,
} from "@/lib/note-activity-payload";
import { postNoteActivityToClientRoom } from "@/lib/chat-cards";
import { ALL_MENTION_TOKEN } from "@/lib/mentions";
import {
  ROADMAP_NEXT_FULL_ERROR,
  ROADMAP_NEXT_MAX,
  isRoadmapStatus,
  roadmapScheduleError,
  type RoadmapStatus,
} from "@/lib/roadmap-status";
import { addWorkingDays, parseWorkingDays, startOfLocalDay, parseDateInputValue, toDateInputValue } from "@/lib/working-days";
import {
  sprintIdFromPlanningHtml,
  stripPlanningTaskAssignees,
} from "@/lib/sprint-planning-doc";
import { isUnstartedSprint } from "@/lib/sprint-status";
import { isClientUser } from "@/lib/client-chat";

type SprintDocPermissions = ReturnType<typeof getAdminPermissions>;

/**
 * Who may write to a sprint document, which depends on where the sprint is.
 *
 * The plan and the review used to be separate notes with a permission each:
 * planning belonged to whoever plans sprints, the review to whoever ends them.
 * One document cannot carry two rules, so the rule follows the sprint instead
 * of the file — you may write the part that is still being written.
 */
function sprintDocEditError(
  perms: SprintDocPermissions,
  status: string | null | undefined,
): string | null {
  if (perms.isAdmin) return null;
  if (!status || isUnstartedSprint(status)) {
    return canSprint(perms, "createPlanning")
      ? null
      : "You do not have permission to edit sprint planning";
  }
  if (status === "ACTIVE") {
    return canSprint(perms, "end")
      ? null
      : "You do not have permission to edit the sprint review";
  }
  return "This sprint document is locked once the sprint closes. Only an admin can edit it.";
}

async function assertCanWriteSprintDoc(
  perms: SprintDocPermissions,
  sprintId: string | null | undefined,
) {
  const sprint = sprintId
    ? await prisma.sprint.findUnique({ where: { id: sprintId }, select: { status: true } })
    : null;
  const error = sprintDocEditError(perms, sprint?.status);
  if (error) throw new Error(error);
}

export async function createMeetingNote(data: {
  projectId: string;
  title: string;
  content: string;
  date: string;
  noteType?: "MEETING_NOTE" | "DECISION" | "CLARIFICATION" | "DEADLINE" | "SPRINT_DOC" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
  dueDate?: string;
  taskId?: string;
  sprintId?: string;
  roadmapStatus?: RoadmapStatus;
  workingDays?: number | string | null;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create notes");

  if (data.noteType === "SPRINT_DOC") {
    const perms =
      user.systemRole === "ADMIN"
        ? getAdminPermissions()
        : getPermissionsFromRole(member.projectRole);
    await assertCanWriteSprintDoc(perms, data.sprintId);
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
      ...(data.sprintId && { sprintId: data.sprintId }),
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
  // Sprint documents are announced when the sprint starts or closes, not when
  // the row is first written — see announceSprintNoteToChat.
  if (note.noteType !== "SPRINT_DOC") {
    const activity = await postNoteActivityToChat({
      projectId: data.projectId,
      noteId: note.id,
      noteTitle: note.title,
      noteType: note.noteType,
      action: "created",
      excerpt: plainTextExcerpt(note.content),
    });

    // The client gets their own copy of the card, in their own room, opening a
    // read-only body. Never let the chat delivery take the note down with it —
    // the note is written either way.
    try {
      await postNoteActivityToClientRoom({ authorId: user.id, payload: activity });
    } catch (err) {
      console.error("[note client chat]", err);
    }
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

  if (note.noteType === "SPRINT_DOC") {
    const perms =
      user.systemRole === "ADMIN"
        ? getAdminPermissions()
        : getPermissionsFromRole(member.projectRole);
    await assertCanWriteSprintDoc(
      perms,
      note.sprintId ?? sprintIdFromPlanningHtml(data.content ?? note.content),
    );
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
  // A sprint document is edited all the way through the sprint — every reason
  // typed and every autosave behind it is an update — and it announces itself
  // at the two moments that matter, when the sprint opens and when it closes.
  // Announcing the edits as well buried those two in a stream of identical
  // cards saying the content changed.
  if (historyEntries.length > 0 && note.noteType !== "SPRINT_DOC") {
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

/** The sprint's one document: its plan and, once it starts, its outcome. */
export async function getSprintDocNote(projectId: string, sprintId: string) {
  const { user } = await requireProjectMember(projectId);
  // One indexed row, guaranteed unique by MeetingNote_one_doc_per_sprint_type.
  // This used to load every sprint note's full HTML body and substring-match it,
  // which was both slow and undefined when a sprint had two documents.
  const note = await prisma.meetingNote.findFirst({
    where: { projectId, sprintId, noteType: "SPRINT_DOC" },
    select: { id: true, title: true, content: true },
  });
  if (!note || !isClientUser(user)) return note;

  // The client reads this document too, and the saved copy has real staff names
  // baked into each task node. The viewer hides the avatars, but the names would
  // still be in the response — so they come out here, before it is sent.
  return { ...note, content: stripPlanningTaskAssignees(note.content) };
}

/**
 * The sprint's document, created with `fallback` if it does not exist yet.
 *
 * The browser used to do this: read, and if it saw nothing, create. Two people
 * opening the planning view at the same moment both read nothing and both
 * created a document, and whichever one the lookup happened to return got the
 * edits while the other person typed into a copy nobody would ever open.
 *
 * MeetingNote_one_doc_per_sprint_type makes the second create fail rather than
 * succeed, and the re-read below hands that caller the winner.
 */
export async function getOrCreateSprintDocNote(input: {
  projectId: string;
  sprintId: string;
  title: string;
  content: string;
  date: string;
}): Promise<{ id: string; title: string; content: string; created: boolean }> {
  const existing = await getSprintDocNote(input.projectId, input.sprintId);
  if (existing) return { ...existing, created: false };

  try {
    const created = await createMeetingNote({
      projectId: input.projectId,
      sprintId: input.sprintId,
      title: input.title,
      content: input.content,
      date: input.date,
      noteType: "SPRINT_DOC",
    });
    return {
      id: created.id,
      title: created.title,
      content: created.content,
      created: true,
    };
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
    if (code !== "P2002") throw err;

    const winner = await getSprintDocNote(input.projectId, input.sprintId);
    if (!winner) throw err;
    return { ...winner, created: false };
  }
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

const TASK_NOTE_EXCLUDED: Array<"SPRINT_DOC" | "SPRINT_PLANNING" | "SPRINT_REVIEW" | "DEADLINE"> = [
  "SPRINT_DOC",
  // Legacy types, on sprint documents left unlinked by the merge.
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
    },
  });
  if (!note) throw new Error("Note not found");

  const { member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create tasks");

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
  sprintId?: string;
  scopeTask?: { code: string; title: string };
  mentionAll?: boolean;
}): Promise<NoteActivityPayload> {
  const project = await prisma.project.findUnique({
    where: { id: payload.projectId },
    select: { name: true },
  });
  const activity: NoteActivityPayload = {
    projectId: payload.projectId,
    noteId: payload.noteId,
    projectName: project?.name,
    noteTitle: payload.noteTitle,
    noteType: payload.noteType,
    action: payload.action,
    fields: payload.fields,
    excerpt: payload.excerpt,
    sprintId: payload.sprintId,
    scopeTask: payload.scopeTask,
  };
  const encoded = encodeNoteActivityBody(activity);
  const sent = await sendMessage({
    projectId: payload.projectId,
    body: payload.mentionAll ? `${encoded}\n${ALL_MENTION_TOKEN}` : encoded,
    kind: "note_activity",
  });
  if (!sent.ok) {
    console.error("[note activity chat]", sent.error);
  }
  return activity;
}

/**
 * Work moving in or out of a sprint that has already started.
 *
 * Announced for the same reason the reason is demanded at the time: the team
 * committed to a scope, and changing it afterwards is a decision the project
 * and the client should both witness, rather than something they find in the
 * sprint document weeks later. The card opens that document, where the change
 * is recorded in full.
 */
export async function announceSprintScopeChangeToChat(options: {
  projectId: string;
  sprintId: string;
  direction: "added" | "removed";
  task: { code: string; title: string };
  reason: string;
}) {
  const note = await getSprintDocNote(options.projectId, options.sprintId);
  if (!note) return;
  const activity = await postNoteActivityToChat({
    projectId: options.projectId,
    noteId: note.id,
    noteTitle: note.title,
    noteType: options.direction === "added" ? SPRINT_TASK_ADDED : SPRINT_TASK_REMOVED,
    action: "published",
    excerpt: options.reason,
    sprintId: options.sprintId,
    scopeTask: options.task,
    mentionAll: true,
  });

  try {
    const user = await requireUser();
    await postNoteActivityToClientRoom({ authorId: user.id, payload: activity });
  } catch (err) {
    console.error("[sprint scope client chat]", err);
  }
}

/**
 * A sprint opening and a sprint closing are two moments worth announcing, even
 * though they now share one document. `card` picks which of the two the message
 * reads as; both link to the same note.
 */
export async function announceSprintNoteToChat(options: {
  projectId: string;
  sprintId: string;
  card: "SPRINT_PLANNING" | "SPRINT_REVIEW";
}) {
  const note = await getSprintDocNote(options.projectId, options.sprintId);
  if (!note) return;
  const activity = await postNoteActivityToChat({
    projectId: options.projectId,
    noteId: note.id,
    noteTitle: note.title,
    noteType: options.card,
    action: "published",
    sprintId: options.sprintId,
    mentionAll: true,
  });

  // A sprint opening or closing is the client's news too, and their room is a
  // separate conversation — the card has to be written into it as well. Never
  // let this take the sprint transition down with it.
  try {
    const user = await requireUser();
    await postNoteActivityToClientRoom({ authorId: user.id, payload: activity });
  } catch (err) {
    console.error("[sprint note client chat]", err);
  }
}
