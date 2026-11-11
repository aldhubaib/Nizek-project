import { describe, expect, it } from "vitest";
import { messageSearchSnippet, messageSearchText } from "@/lib/message-search";
import { encodeNoteCommentBody } from "@/lib/note-comment-payload";

describe("messageSearchText", () => {
  it("turns mention tokens into the name people type", () => {
    expect(messageSearchText("hey @[Ada Lovelace](user_1) the invoice")).toBe(
      "hey @Ada Lovelace the invoice",
    );
  });

  it("searches a note comment by its words, not the stored payload", () => {
    const body = encodeNoteCommentBody(
      {
        noteId: "n1",
        projectId: "p1",
        threadId: "t1",
        noteTitle: "Billing change",
        quoteText: "net 30",
        comment: "move this to net 15",
      },
      [],
    );
    const text = messageSearchText(body);
    expect(text).toContain("move this to net 15");
    expect(text).toContain("Billing change");
    expect(text).not.toContain("noteId");
  });

  it("appends attachment filenames", () => {
    expect(messageSearchText("", ["Q3-plan.pdf"])).toBe("Q3-plan.pdf");
  });
});

describe("messageSearchSnippet", () => {
  it("marks the match inside a window", () => {
    const { snippet, matchStart, matchEnd } = messageSearchSnippet(
      "Please send the invoice number tomorrow",
      "invoice",
    );
    expect(snippet.slice(matchStart, matchEnd).toLowerCase()).toBe("invoice");
  });

  it("ellipsizes a match that sits deep in the text", () => {
    const head = "a".repeat(80);
    const { snippet, matchStart } = messageSearchSnippet(`${head} invoice`, "invoice", 10);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.slice(matchStart, matchStart + 7)).toBe("invoice");
  });
});
