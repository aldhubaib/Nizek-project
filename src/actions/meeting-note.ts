"use server";

import { prisma } from "@/lib/prisma";
import { requireProjectMember, requireProjectRole } from "@/lib/auth";
import { logTaskActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";
import { createTask } from "@/actions/task";
import { sendMessage } from "@/actions/messages";
import { applyStoredAnnotationMarks, plainTextExcerpt, taskMarkTag, wrapFirstPlainText } from "@/lib/html-annotate";
import { diffNoteParagraphs, encodeContentDiff } from "@/lib/note-content-diff";
import { encodeNoteActivityBody } from "@/lib/note-activity-payload";
import {
  isRoadmapStatus,
  type RoadmapStatus,
} from "@/lib/roadmap-status";

export async function createMeetingNote(data: {
  projectId: string;
  title: string;
  content: string;
  date: string;
  noteType?: "MEETING_NOTE" | "DECISION" | "DEADLINE" | "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
  dueDate?: string;
  taskId?: string;
  roadmapStatus?: RoadmapStatus;
}) {
  const { user, member } = await requireProjectMember(data.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create notes");

  if (data.noteType === "DEADLINE" && !data.dueDate) {
    throw new Error("Due date is required");
  }

  const roadmapStatus =
    data.noteType === "DEADLINE" && data.roadmapStatus && isRoadmapStatus(data.roadmapStatus)
      ? data.roadmapStatus
      : "PLANNED";

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
): Promise<{ roadmapStatus: RoadmapStatus; completedAt: Date | null }> {
  if (!isRoadmapStatus(status)) throw new Error("Invalid roadmap status");

  const note = await prisma.meetingNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Note not found");
  if (note.noteType !== "DEADLINE") throw new Error("Not a roadmap item");

  const { user, member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot edit notes");

  const completedAt =
    status === "SHIPPED" ? note.completedAt ?? new Date() : null;

  await prisma.$transaction([
    prisma.meetingNote.update({
      where: { id: noteId },
      data: { roadmapStatus: status, completedAt },
    }),
    ...(note.roadmapStatus !== status
      ? [
          prisma.noteHistory.create({
            data: {
              noteId: note.id,
              userId: user.id,
              field: "roadmapStatus",
              oldValue: note.roadmapStatus,
              newValue: status,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/dashboard/projects/${note.projectId}`);
  return { roadmapStatus: status, completedAt };
}

export async function updateMeetingNote(data: {
  noteId: string;
  title?: string;
  content?: string;
  date?: string;
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
    const updated = await prisma.meetingNote.update({
      where: { id: data.noteId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.date && { date: new Date(data.date) }),
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

  const [updated] = await prisma.$transaction([
    prisma.meetingNote.update({
      where: { id: data.noteId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.date && { date: new Date(data.date) }),
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

export async function searchProjectNotesForLink(projectId: string, taskId: string, query = "") {
  await requireProjectMember(projectId);
  const q = query.trim();
  return prisma.meetingNote.findMany({
    where: {
      projectId,
      NOT: {
        OR: [{ taskId }, { taskLinks: { some: { taskId } } }],
      },
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
    select: { id: true, title: true, content: true, projectId: true },
  });
  if (!note) throw new Error("Note not found");

  const { member } = await requireProjectMember(note.projectId);
  if (member.role === "CLIENT") throw new Error("Clients cannot create tasks");

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
