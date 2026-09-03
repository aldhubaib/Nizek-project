// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ALIGNABLE_TYPES, BlockTextAlign } from "@/components/tiptap/block-align";

/**
 * Positions in `<h1>One</h1><h1>Two</h1>`:
 *
 *   heading @ 0 (size 5) — its text occupies 1..4
 *   heading @ 5 (size 5) — its text occupies 6..9
 *
 * Only positions inside that inline content can be selection endpoints, so
 * `to` is meaningful at 4 (end of "One") and at 6 (start of "Two"); anything
 * between the two is not a place a text selection can end, and ProseMirror
 * collapses such a range to a cursor.
 */
const TWO_HEADINGS = "<h1>One</h1><h1>Two</h1>";

function editorWith(content: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      BlockTextAlign.configure({ types: [...ALIGNABLE_TYPES] }),
    ],
    content,
  });
}

/** Which blocks came out centred, by their text. */
function centred(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.isTextblock && node.attrs.textAlign === "center") {
      out.push(node.textContent);
    }
    return true;
  });
  return out;
}

describe("aligning the blocks a selection covers", () => {
  it("aligns the block the cursor sits in", () => {
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection(2);
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["One"]);
  });

  it("aligns a block whose text is selected exactly", () => {
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection({ from: 1, to: 4 });
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["One"]);
  });

  it("does not align the next block when the drag only reaches its start", () => {
    // The regression this file exists for. Dragging past the end of a line
    // extends the selection to the start of the block below without selecting
    // any of its text, and the stock extension counted that block too — so
    // centring one heading centred the heading under it as well.
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(editor.state.selection.empty).toBe(false);
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["One"]);
  });

  it("aligns both once a single character of the next block is selected", () => {
    // One position further than the case above, and now the intent is real.
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection({ from: 1, to: 7 });
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["One", "Two"]);
  });

  it("aligns every block a wide selection spans", () => {
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection({ from: 2, to: 8 });
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["One", "Two"]);
  });

  it("aligns one block when its parent node is selected", () => {
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection(2);
    editor.commands.selectParentNode();
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["One"]);
  });

  it("leaves the neighbour alone when realigning one block back to the left", () => {
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection({ from: 2, to: 8 });
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["One", "Two"]);

    editor.commands.setTextSelection({ from: 1, to: 4 });
    editor.commands.setTextAlign("left");
    expect(centred(editor)).toEqual(["Two"]);
  });

  it("round-trips through HTML so a saved document keeps its alignment", () => {
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection(2);
    editor.commands.setTextAlign("center");

    const reopened = editorWith(editor.getHTML());
    expect(centred(reopened)).toEqual(["One"]);
  });

  it("aligns paragraphs as well as headings", () => {
    const editor = editorWith("<p>Body</p>");
    editor.commands.setTextSelection(2);
    editor.commands.setTextAlign("center");
    expect(centred(editor)).toEqual(["Body"]);
  });

  it("refuses an alignment it was not configured with", () => {
    const editor = editorWith(TWO_HEADINGS);
    editor.commands.setTextSelection(2);
    expect(editor.commands.setTextAlign("sideways")).toBe(false);
  });
});
