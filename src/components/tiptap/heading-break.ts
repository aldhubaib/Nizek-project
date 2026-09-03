import { Extension } from "@tiptap/core";

/**
 * Shift+Enter inside a heading starts a new block instead of inserting a hard
 * break.
 *
 * A hard break keeps both lines in the same node, so they cannot be aligned,
 * styled or reordered apart. Typing a title above an existing heading this way
 * fuses the two into one silently, and the only clue is that aligning either
 * one moves both. Outside a heading the usual hard break still applies, which
 * is what people want mid-paragraph.
 */
export const HeadingBreak = Extension.create({
  name: "headingBreak",

  // Ahead of StarterKit's HardBreak, which also claims Shift-Enter.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => {
        const { $from } = this.editor.state.selection;
        // Returning false hands the key back to HardBreak.
        if ($from.parent.type.name !== "heading") return false;
        return this.editor.commands.splitBlock();
      },
    };
  },
});
