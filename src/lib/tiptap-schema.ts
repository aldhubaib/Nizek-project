/**
 * The note document schema, with no React and no node views.
 *
 * The collaboration server has to agree with the browser about what a document
 * is made of — it converts between HTML, ProseMirror JSON and Yjs, and every
 * one of those conversions needs the schema. It cannot import the components
 * that render these nodes, because those pull in React, `next/*` and browser
 * globals. So the schema lives here and the components extend it with their
 * node views.
 *
 * Anything that changes how a node is stored or serialised — its attributes,
 * parseHTML or renderHTML — belongs in this file. Anything about how it looks
 * belongs in the component.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import type { SprintPlanningInfo, SprintPlanningTask } from "@/lib/sprint-planning-doc";
import { NoteAnnotation } from "@/components/tiptap/note-annotation-mark";
import { TextDirection } from "@/components/tiptap/text-direction";

export type ImageAlign = "left" | "center" | "right";
export type ImageDisplay = "normal" | "full";

export type AttendancePerson = {
  id: string;
  name: string | null;
  imageUrl: string | null;
};

export const NoteImageSchema = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (el) => {
          const value = el.getAttribute("data-align");
          return value === "left" || value === "right" || value === "center" ? value : "center";
        },
        renderHTML: (attrs) => ({ "data-align": attrs.align ?? "center" }),
      },
      display: {
        default: "normal",
        parseHTML: (el) => {
          const value = el.getAttribute("data-display");
          return value === "full" ? "full" : "normal";
        },
        renderHTML: (attrs) => ({ "data-display": attrs.display ?? "normal" }),
      },
    };
  },
});

function personHtml(person: AttendancePerson) {
  const name = person.name ?? "Someone";
  return [
    "span",
    {
      class: "note-people-avatar",
      "data-user-id": person.id,
      title: name,
    },
    person.imageUrl
      ? ["img", { src: person.imageUrl, alt: "", class: "note-people-photo" }]
      : ["span", { class: "note-people-fallback" }, name.charAt(0).toUpperCase()],
  ];
}

export const AttendanceBlockSchema = Node.create({
  name: "attendance",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      people: {
        default: [] as AttendancePerson[],
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-people") || "[]") as AttendancePerson[];
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          "data-people": JSON.stringify(attributes.people ?? []),
        }),
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'span[data-type="attendance"]' },
      { tag: 'div[data-type="attendance"]' },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const people = (node.attrs.people ?? []) as AttendancePerson[];
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "attendance",
        class: "note-people-inline",
        contenteditable: "false",
      }),
      ...people.map(personHtml),
    ];
  },
});

export const SprintInfoBlockSchema = Node.create<{
  projectId?: string;
  isAdmin?: boolean;
  getIsAdmin?: () => boolean;
  canStartSprint?: boolean;
  getCanStartSprint?: () => boolean;
  canEndSprint?: boolean;
  getCanEndSprint?: () => boolean;
  onSprintStatusChange?: (status: string) => void;
}>({
  name: "sprintInfo",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addOptions() {
    return {
      projectId: undefined,
      isAdmin: false,
      getIsAdmin: undefined,
      canStartSprint: false,
      getCanStartSprint: undefined,
      canEndSprint: false,
      getCanEndSprint: undefined,
      onSprintStatusChange: undefined,
    };
  },
  addAttributes() {
    return {
      info: {
        default: null as SprintPlanningInfo | null,
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-info") || "null") as SprintPlanningInfo | null;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => ({
          "data-info": JSON.stringify(attributes.info ?? null),
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="sprint-info"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "sprint-info",
        contenteditable: "false",
      }),
    ];
  },
});

export const SprintTaskBlockSchema = Node.create<{
  projectId?: string;
  sprintId?: string;
  sprintTasks?: SprintPlanningTask[];
  hideAssignee?: boolean;
  onTasksPatched?: (taskId: string, patch: Partial<SprintPlanningTask>) => void;
}>({
  name: "sprintTask",
  group: "block",
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return {
      projectId: "",
      sprintId: "",
      sprintTasks: [],
      hideAssignee: false,
      onTasksPatched: undefined,
    };
  },
  addAttributes() {
    return {
      id: {
        default: null as string | null,
        parseHTML: (element) => {
          const attr = element.getAttribute("data-id");
          if (attr) return attr;
          try {
            const task = JSON.parse(element.getAttribute("data-task") || "null") as {
              id?: string;
            } | null;
            return task?.id ?? null;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) =>
          attributes.id ? { "data-id": attributes.id as string } : {},
      },
      task: {
        default: null as SprintPlanningTask | null,
        parseHTML: (element) => {
          try {
            return JSON.parse(element.getAttribute("data-task") || "null") as SprintPlanningTask | null;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => ({
          "data-task": JSON.stringify(attributes.task ?? null),
        }),
      },
      showQuestions: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-show-questions") === "true",
        renderHTML: (attributes) =>
          attributes.showQuestions ? { "data-show-questions": "true" } : {},
      },
      decision: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-decision") ?? "",
        renderHTML: (attributes) => ({ "data-decision": attributes.decision ?? "" }),
      },
      risk: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-risk") ?? "",
        renderHTML: (attributes) => ({ "data-risk": attributes.risk ?? "" }),
      },
      variant: {
        default: "planning",
        parseHTML: (element) => element.getAttribute("data-variant") || "planning",
        renderHTML: (attributes) =>
          attributes.variant && attributes.variant !== "planning"
            ? { "data-variant": attributes.variant }
            : {},
      },
      incompleteReason: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-incomplete-reason") ?? "",
        renderHTML: (attributes) => ({
          "data-incomplete-reason": attributes.incompleteReason ?? "",
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="sprint-task"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "sprint-task",
        contenteditable: "false",
      }),
      ["br"],
    ];
  },
});

/**
 * Every extension a note document can contain, schema only.
 *
 * Must stay in step with the editor's own extension list, or the collaboration
 * server will silently drop nodes it does not recognise when it converts a
 * document. Undo is off because there is no undo stack to keep on a server.
 */
export const noteSchemaExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, undoRedo: false }),
  NoteImageSchema.configure({ inline: false }),
  TextDirection,
  NoteAnnotation,
  AttendanceBlockSchema,
  SprintInfoBlockSchema,
  SprintTaskBlockSchema,
];
