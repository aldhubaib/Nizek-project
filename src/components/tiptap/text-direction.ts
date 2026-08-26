import { Extension } from "@tiptap/core";

export type TextDir = "ltr" | "rtl";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textDirection: {
      setTextDirection: (direction: TextDir | null) => ReturnType;
    };
  }
}

const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "bulletList",
  "orderedList",
];

export const TextDirection = Extension.create({
  name: "textDirection",

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => {
              const dir = element.getAttribute("dir");
              return dir === "rtl" || dir === "ltr" ? dir : null;
            },
            renderHTML: (attributes) => {
              if (attributes.dir !== "rtl" && attributes.dir !== "ltr") return {};
              return { dir: attributes.dir };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextDirection:
        (direction) =>
        ({ tr, state, dispatch }) => {
          const types = new Set(BLOCK_TYPES);
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!types.has(node.type.name)) return;
            if (node.attrs.dir === direction) return;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, dir: direction });
            changed = true;
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-r": () => this.editor.commands.setTextDirection("rtl"),
      "Mod-Alt-l": () => this.editor.commands.setTextDirection("ltr"),
    };
  },
});
