import { describe, expect, it } from "vitest";
import {
  encodeNoteActivityBody,
  isClientSprintBotMessage,
  isSprintAnnouncementCard,
  isSprintScopeCard,
  SPRINT_TASK_ADDED,
  SPRINT_TASK_REMOVED,
} from "@/lib/note-activity-payload";

describe("isSprintAnnouncementCard", () => {
  it("covers the four client-room sprint cards", () => {
    expect(isSprintAnnouncementCard("SPRINT_PLANNING")).toBe(true);
    expect(isSprintAnnouncementCard("SPRINT_REVIEW")).toBe(true);
    expect(isSprintAnnouncementCard(SPRINT_TASK_ADDED)).toBe(true);
    expect(isSprintAnnouncementCard(SPRINT_TASK_REMOVED)).toBe(true);
  });

  it("leaves ordinary notes and the sprint document itself out", () => {
    expect(isSprintAnnouncementCard("MEETING_NOTE")).toBe(false);
    expect(isSprintAnnouncementCard("DEADLINE")).toBe(false);
    expect(isSprintAnnouncementCard("SPRINT_DOC")).toBe(false);
    expect(isSprintScopeCard("SPRINT_PLANNING")).toBe(false);
  });
});

describe("isClientSprintBotMessage", () => {
  const planning = encodeNoteActivityBody({
    noteId: "n1",
    projectId: "p1",
    noteTitle: "Sprint 2",
    noteType: "SPRINT_PLANNING",
    action: "published",
  });

  it("recognizes a sprint announcement body", () => {
    expect(isClientSprintBotMessage("note_activity", planning)).toBe(true);
  });

  it("ignores ordinary notes and other kinds", () => {
    const meeting = encodeNoteActivityBody({
      noteId: "n1",
      projectId: "p1",
      noteTitle: "Kickoff",
      noteType: "MEETING_NOTE",
      action: "created",
    });
    expect(isClientSprintBotMessage("note_activity", meeting)).toBe(false);
    expect(isClientSprintBotMessage("message", planning)).toBe(false);
  });
});
