import { milestoneLabel } from "@/lib/deadline-milestones";

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
    });
  }

  if (input.noteType === "DEADLINE") {
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
  if (field === "content") return "Updated content";
  return `Changed ${field}`;
}
