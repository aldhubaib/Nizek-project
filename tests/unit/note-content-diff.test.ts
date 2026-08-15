import { describe, expect, it } from "vitest";
import { diffNoteParagraphs, decodeContentDiff, encodeContentDiff } from "@/lib/note-content-diff";

describe("diffNoteParagraphs", () => {
  it("reports a changed paragraph", () => {
    const changes = diffNoteParagraphs(
      "<p>Invite guests via SMS</p>",
      "<p>Invite guests via WhatsApp</p>",
    );
    expect(changes).toEqual([
      {
        type: "changed",
        paragraph: 1,
        before: "Invite guests via SMS",
        after: "Invite guests via WhatsApp",
      },
    ]);
  });

  it("reports added and removed paragraphs", () => {
    const changes = diffNoteParagraphs(
      "<h2>Goals</h2><p>Keep MVP small</p>",
      "<h2>Goals</h2><p>Keep MVP small</p><p>Add scanner page</p>",
    );
    expect(changes).toEqual([{ type: "added", paragraph: 3, after: "Add scanner page" }]);
  });

  it("round-trips through JSON", () => {
    const changes = diffNoteParagraphs("<p>A</p>", "<p>B</p>");
    expect(decodeContentDiff(encodeContentDiff(changes))).toEqual(changes);
  });

  it("matches a rewritten paragraph when another is added", () => {
    const changes = diffNoteParagraphs(
      "<p>Invite guests via SMS</p><p>Keep MVP small</p>",
      "<p>Invite guests via WhatsApp</p><p>Keep MVP small</p><p>Add scanner</p>",
    );
    expect(changes).toEqual([
      {
        type: "changed",
        paragraph: 1,
        before: "Invite guests via SMS",
        after: "Invite guests via WhatsApp",
      },
      { type: "added", paragraph: 3, after: "Add scanner" },
    ]);
  });

  it("reports a deleted paragraph without shifting later ones as edits", () => {
    const flow =
      "End-to-end flow: create event → allocate credits → send invites → RSVP → generate QR → scan at door → report";
    const invite = "Send invite:";
    const over =
      "No over-reservation : send is blocked if insufficient available credits.";
    const changes = diffNoteParagraphs(
      `<p>Intro</p><p>${flow}</p><p>${invite}</p><p>${over}</p>`,
      `<p>Intro</p><p>${invite}</p><p>${over}</p>`,
    );
    expect(changes).toEqual([{ type: "removed", paragraph: 2, before: flow }]);
  });
});
