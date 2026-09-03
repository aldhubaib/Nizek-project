// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { ALIGNABLE_TYPES, BlockTextAlign } from "@/components/tiptap/block-align";
import { HeadingBreak } from "@/components/tiptap/heading-break";

function editorWith(content: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      BlockTextAlign.configure({ types: [...ALIGNABLE_TYPES] }),
      HeadingBreak,
    ],
    content,
  });
}

function shiftEnter(editor: Editor) {
  return editor.commands.keyboardShortcut("Shift-Enter");
}

/** The editor keeps an empty paragraph after a trailing heading; ignore it. */
function html(editor: Editor) {
  return editor.getHTML().replace(/<p><\/p>$/, "");
}

describe("Shift+Enter inside a heading", () => {
  it("splits the heading into two blocks instead of adding a hard break", () => {
    const editor = editorWith("<h1>OneTwo</h1>");
    editor.commands.setTextSelection(4); // between "One" and "Two"
    expect(shiftEnter(editor)).toBe(true);
    expect(html(editor)).toBe("<h1>One</h1><h1>Two</h1>");
  });

  it("never leaves a hard break inside a heading", () => {
    const editor = editorWith("<h1>OneTwo</h1>");
    editor.commands.setTextSelection(4);
    shiftEnter(editor);
    expect(editor.getHTML()).not.toContain("<br");
  });

  it("reproduces typing a title above an existing heading, kept separate", () => {
    // The gesture that fused the agreement's first two headings.
    const editor = editorWith("<h1>1. Purpose</h1>");
    editor.commands.setTextSelection(1); // start of the heading
    editor.commands.insertContent("Client agreement");
    shiftEnter(editor);

    expect(html(editor)).toBe("<h1>Client agreement</h1><h1>1. Purpose</h1>");
  });

  it("leaves the two halves alignable on their own", () => {
    const editor = editorWith("<h1>1. Purpose</h1>");
    editor.commands.setTextSelection(1);
    editor.commands.insertContent("Client agreement");
    shiftEnter(editor);

    // Centre only the title, which now sits in its own node.
    editor.commands.setTextSelection(2);
    editor.commands.setTextAlign("center");

    const aligned: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isTextblock && node.attrs.textAlign) {
        aligned.push(`${node.attrs.textAlign}: ${node.textContent}`);
      }
      return true;
    });
    expect(aligned).toEqual(["center: Client agreement"]);
  });

  it("still inserts a hard break inside a paragraph", () => {
    const editor = editorWith("<p>OneTwo</p>");
    editor.commands.setTextSelection(4);
    expect(shiftEnter(editor)).toBe(true);
    expect(editor.getHTML()).toBe("<p>One<br>Two</p>");
  });

  it("still inserts a hard break inside a list item", () => {
    const editor = editorWith("<ul><li><p>OneTwo</p></li></ul>");
    editor.commands.setTextSelection(6); // inside the item's paragraph
    shiftEnter(editor);
    expect(editor.getHTML()).toContain("<br");
  });
});
