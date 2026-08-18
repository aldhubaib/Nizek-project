import { Mark, mergeAttributes } from "@tiptap/core";

export const NoteAnnotation = Mark.create({
  name: "noteAnnotation",
  excludes: "",
  inclusive: false,
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-thread-id"),
        renderHTML: (attrs) =>
          attrs.threadId ? { "data-thread-id": attrs.threadId } : {},
      },
      taskId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-task-id"),
        renderHTML: (attrs) =>
          attrs.taskId ? { "data-task-id": attrs.taskId } : {},
      },
      kind: {
        default: "comment",
        parseHTML: (el) => el.getAttribute("data-kind") ?? "comment",
        renderHTML: (attrs) => ({ "data-kind": attrs.kind }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark.note-annotation" }, { tag: "mark[data-kind]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const kind =
      (HTMLAttributes["data-kind"] as string | undefined) ?? "comment";
    return [
      "mark",
      mergeAttributes(HTMLAttributes, {
        class: `note-annotation note-annotation-${kind}`,
      }),
      0,
    ];
  },
});
