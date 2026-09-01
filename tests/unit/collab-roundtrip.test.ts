/**
 * The collaboration server converts HTML -> Yjs on first open and Yjs -> HTML on
 * every save. Both directions run through the shared schema, and if that schema
 * is missing a node the conversion drops it silently.
 *
 * The sprint-info node is the one that matters most: it renders the Sprint
 * Information table and the Start sprint button, so losing it makes a sprint
 * impossible to start with no visible error.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

let generateHTML: typeof import("@tiptap/core").generateHTML;
let generateJSON: typeof import("@tiptap/core").generateJSON;
let getSchema: typeof import("@tiptap/core").getSchema;
let prosemirrorJSONToYDoc: typeof import("y-prosemirror").prosemirrorJSONToYDoc;
let yXmlFragmentToProsemirrorJSON: typeof import("y-prosemirror").yXmlFragmentToProsemirrorJSON;
let Y: typeof import("yjs");
let noteSchemaExtensions: typeof import("@/lib/tiptap-schema").noteSchemaExtensions;

const COLLAB_FIELD = "default";

beforeAll(async () => {
  const dom = new JSDOM("<!DOCTYPE html><body></body>");
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window ??= dom.window;
  globals.document ??= dom.window.document;
  globals.DOMParser ??= dom.window.DOMParser;
  globals.Node ??= dom.window.Node;

  ({ generateHTML, generateJSON, getSchema } = await import("@tiptap/core"));
  ({ prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON } = await import("y-prosemirror"));
  Y = await import("yjs");
  ({ noteSchemaExtensions } = await import("@/lib/tiptap-schema"));
});

/** What collab-server.ts does across a fetch and a subsequent store. */
function roundTrip(html: string): string {
  const seeded = prosemirrorJSONToYDoc(
    getSchema(noteSchemaExtensions),
    generateJSON(html, noteSchemaExtensions),
    COLLAB_FIELD,
  );
  const update = Y.encodeStateAsUpdate(seeded);

  const reloaded = new Y.Doc();
  Y.applyUpdate(reloaded, update);
  return generateHTML(
    yXmlFragmentToProsemirrorJSON(reloaded.getXmlFragment(COLLAB_FIELD)),
    noteSchemaExtensions,
  );
}

const PLANNING_HTML = [
  `<div data-type="sprint-info" data-info="${JSON.stringify({
    sprintId: "sprint-1",
    sprintName: "Sprint 7",
    variant: "planning",
  })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")}"></div>`,
  `<h2>List of Sprint Items</h2>`,
  `<p>Everything the team committed to.</p>`,
  `<div data-type="sprint-task" data-id="task-1" data-task="${JSON.stringify({
    id: "task-1",
    code: "FEA-1",
    title: "Ship the thing",
  })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")}" data-show-questions="true" data-decision="Agreed to ship" data-risk="API may slip"><br></div>`,
].join("");

describe("collaboration HTML round-trip", () => {
  it("keeps the sprint-info node, which carries the Start sprint button", () => {
    const out = roundTrip(PLANNING_HTML);
    expect(out).toContain('data-type="sprint-info"');
    expect(out).toContain("sprint-1");
  });

  it("keeps sprint-task nodes and their ids", () => {
    const out = roundTrip(PLANNING_HTML);
    expect(out).toContain('data-type="sprint-task"');
    expect(out).toContain('data-id="task-1"');
  });

  it("keeps Decision and Risk text", () => {
    const out = roundTrip(PLANNING_HTML);
    expect(out).toContain("Agreed to ship");
    expect(out).toContain("API may slip");
  });

  it("keeps ordinary prose", () => {
    const out = roundTrip(PLANNING_HTML);
    expect(out).toContain("List of Sprint Items");
    expect(out).toContain("Everything the team committed to.");
  });

  it("survives a second round-trip unchanged", () => {
    const once = roundTrip(PLANNING_HTML);
    expect(roundTrip(once)).toBe(once);
  });
});
