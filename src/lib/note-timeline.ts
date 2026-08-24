import { milestoneLabel } from "@/lib/deadline-milestones";
import { roadmapStatusLabel } from "@/lib/roadmap-status";
import { decodeContentDiff, summarizeContentDiff, type ParagraphChange } from "@/lib/note-content-diff";

export interface NoteTimelineUser {
  id: string;
  name: string | null;
  imageUrl: string | null;
}

export interface NoteTimelineEdit {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date | string;
  user: NoteTimelineUser;
}

export interface NoteTimelineReminder {
  id: string;
  offsetDays: number;
  sentAt: Date | string;
}

export interface NoteTimelineComment {
  id: string;
  content: string;
  quoteText: string;
  createdAt: Date | string;
  user: NoteTimelineUser;
  isReply: boolean;
}

export interface NoteTimelineTask {
  id: string;
  quoteText: string | null;
  createdAt: Date | string;
  user: NoteTimelineUser;
  taskTitle: string;
  taskCode?: string;
}

export type NoteTimelineEvent =
  | {
      kind: "created";
      id: string;
      at: Date;
      user: NoteTimelineUser;
    }
  | {
      kind: "edited";
      id: string;
      at: Date;
      user: NoteTimelineUser;
      field: string;
      oldValue: string | null;
      newValue: string | null;
      paragraphChanges?: ParagraphChange[];
    }
  | {
      kind: "comment";
      id: string;
      at: Date;
      user: NoteTimelineUser;
      quoteText: string;
      comment: string;
      isReply: boolean;
    }
  | {
      kind: "task";
      id: string;
      at: Date;
      user: NoteTimelineUser;
      quoteText: string | null;
      taskTitle: string;
      taskCode?: string;
    }
  | {
      kind: "reminder";
      id: string;
      at: Date;
      offsetDays: number;
      label: string;
    };

export function buildNoteTimeline(input: {
  id: string;
  noteType: string;
  createdAt: Date | string;
  author: NoteTimelineUser;
  history?: NoteTimelineEdit[];
  reminderLogs?: NoteTimelineReminder[];
  comments?: NoteTimelineComment[];
  tasks?: NoteTimelineTask[];
}): NoteTimelineEvent[] {
  const events: NoteTimelineEvent[] = [
    {
      kind: "created",
      id: `created-${input.id}`,
      at: new Date(input.createdAt),
      user: input.author,
    },
  ];

  for (const entry of input.history ?? []) {
    events.push({
      kind: "edited",
      id: entry.id,
      at: new Date(entry.createdAt),
      user: entry.user,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      paragraphChanges:
        entry.field === "content" ? decodeContentDiff(entry.newValue) ?? undefined : undefined,
    });
  }

  for (const comment of input.comments ?? []) {
    events.push({
      kind: "comment",
      id: `comment-${comment.id}`,
      at: new Date(comment.createdAt),
      user: comment.user,
      quoteText: comment.quoteText,
      comment: comment.content,
      isReply: comment.isReply,
    });
  }

  for (const task of input.tasks ?? []) {
    events.push({
      kind: "task",
      id: `task-${task.id}`,
      at: new Date(task.createdAt),
      user: task.user,
      quoteText: task.quoteText,
      taskTitle: task.taskTitle,
      taskCode: task.taskCode,
    });
  }

  if (input.noteType === "DEADLINE" || input.noteType === "ROADMAP") {
    for (const log of input.reminderLogs ?? []) {
      events.push({
        kind: "reminder",
        id: log.id,
        at: new Date(log.sentAt),
        offsetDays: log.offsetDays,
        label: milestoneLabel(log.offsetDays),
      });
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function editTimelineDescription(
  field: string,
  oldValue: string | null,
  newValue: string | null,
): string {
  if (field === "title") {
    if (oldValue && newValue) {
      return `Changed title from "${oldValue}" to "${newValue}"`;
    }
    return "Changed title";
  }
  if (field === "content") {
    const changes = decodeContentDiff(newValue);
    if (changes && changes.length > 0) {
      return summarizeContentDiff(changes);
    }
    return "Updated content";
  }
  if (field === "roadmapStatus") {
    const from = oldValue ? roadmapStatusLabel(oldValue) : null;
    const to = newValue ? roadmapStatusLabel(newValue) : null;
    if (from && to) return `Moved from ${from} to ${to}`;
    return "Changed roadmap status";
  }
  if (field === "dueDate") {
    if (oldValue && newValue) return `Changed due date from ${oldValue} to ${newValue}`;
    if (newValue) return `Set due date to ${newValue}`;
    if (oldValue) return `Cleared due date`;
    return "Changed due date";
  }
  if (field === "startedAt") {
    if (oldValue && newValue) return `Changed starting date from ${oldValue} to ${newValue}`;
    if (newValue) return `Set starting date to ${newValue}`;
    if (oldValue) return `Cleared starting date`;
    return "Changed starting date";
  }
  if (field === "workingDays") {
    const from = oldValue ? `${oldValue} effort${oldValue === "1" ? "" : "s"}` : "none";
    const to = newValue ? `${newValue} effort${newValue === "1" ? "" : "s"}` : "none";
    return `Changed effort from ${from} to ${to}`;
  }
  return `Changed ${field}`;
}
