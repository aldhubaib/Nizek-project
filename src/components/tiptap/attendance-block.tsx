"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { AttendanceBlockSchema, type AttendancePerson } from "@/lib/tiptap-schema";

export type { AttendancePerson };

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

export const AttendanceBlock = AttendanceBlockSchema.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AttendanceNodeView, { as: "span" });
  },
});
