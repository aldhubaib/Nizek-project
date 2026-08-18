"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";

export type AttendancePerson = {
  id: string;
  name: string | null;
  imageUrl: string | null;
};

function PersonAvatar({ person }: { person: AttendancePerson }) {
  const name = person.name ?? "Someone";
  const initial = name.charAt(0).toUpperCase();
  return (
    <span className="note-people-avatar group/person relative inline-flex align-middle">
      {person.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.imageUrl} alt="" className="size-5 rounded-full object-cover" />
      ) : (
        <span className="grid size-5 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {initial}
        </span>
      )}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-md transition-opacity group-hover/person:opacity-100">
        {name}
      </span>
    </span>
  );
}

function AttendanceNodeView({ node }: ReactNodeViewProps) {
  const people = (node.attrs.people ?? []) as AttendancePerson[];
  return (
    <NodeViewWrapper
      as="span"
      data-type="attendance"
      contentEditable={false}
      className="note-people-inline not-prose inline-flex select-none items-center gap-0.5 align-middle"
    >
      {people.map((person) => (
        <PersonAvatar key={person.id} person={person} />
      ))}
    </NodeViewWrapper>
  );
}

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

export const AttendanceBlock = Node.create({
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
  addNodeView() {
    return ReactNodeViewRenderer(AttendanceNodeView, { as: "span" });
  },
});
