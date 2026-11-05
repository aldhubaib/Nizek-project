"use client";

import * as React from "react";
import { format } from "date-fns";
import { CheckCircle2, StickyNote } from "lucide-react";

import { taskCode } from "@/lib/task-label";
import { byNumber, byText, Chip, Collection, Fact, RecordRow, RecordRowSkeleton, useList, type Pill, type SortDef } from "@/next-ui/blocks";
import { useProjectNotes, type NoteRow } from "@/next-ui/data/notes";
import { excerpt, htmlToText } from "@/next-ui/lib/safe-html";
import { childId, hrefFromEntry } from "@/next-ui/panes";
import { FilterBar } from "@/next-ui/patterns/filter-bar";

import { NOTE_TYPES, noteTypeLabel, NoteTypeIcon } from "./note-marks";

type Row = NoteRow & { text: string };

const SORTS: SortDef<Row>[] = [
  { id: "newest", label: "Newest", compare: byNumber((n) => new Date(n.date).getTime()) },
  { id: "updated", label: "Last edited", compare: byNumber((n) => new Date(n.updatedAt).getTime()) },
  { id: "title", label: "Title", compare: byText((n) => n.title) },
];

const searchText = (n: Row) => [n.title, n.text, n.author?.name, n.task?.title].filter(Boolean).join(" ");

/**
 * The project's notes as rows: kind, title, a line of the body, who wrote it and when, the
 * task it is about, and for a roadmap item its due date and whether it is done. The pills
 * narrow the list to one kind; the search is in the pane header. A click opens the note
 * beside this pane. Writing and editing notes are not built here yet.
 */
export function NotesView({ projectId }: { projectId: string }) {
  const notes = useProjectNotes(projectId);
  const [type, setType] = React.useState("all");

  const rows = React.useMemo<Row[] | undefined>(
    () => notes.data?.map((n) => ({ ...n, text: excerpt(htmlToText(n.content), 200) })),
    [notes.data],
  );
  const types = React.useMemo<Pill[]>(() => {
    const present = new Set<string>((rows ?? []).map((n) => n.noteType));
    return [
      { id: "all", label: "All" },
      ...Object.keys(NOTE_TYPES)
        .filter((t) => present.has(t))
        .map((t) => ({ id: t, label: noteTypeLabel(t) })),
    ];
  }, [rows]);
  const scoped = React.useMemo(() => (type === "all" ? rows : rows?.filter((n) => n.noteType === type)), [rows, type]);
  const list = useList(scoped, { searchText, sorts: SORTS, defaultSort: "newest" });
  const isFiltered = list.isFiltered || type !== "all";

  return (
    <div className="flex flex-col">
      <FilterBar
        search={list.query.search}
        onSearch={list.setSearch}
        placeholder="Search notes…"
        sorts={SORTS}
        sort={list.query.sort ?? "newest"}
        onSort={list.setSort}
        types={types.length > 2 ? types : undefined}
        type={type}
        onType={setType}
        typeLabel="Kind"
        isFiltered={isFiltered}
        onReset={() => {
          list.reset();
          setType("all");
        }}
      />
      <Collection
        layout="rows"
        items={list.rows}
        total={rows?.length}
        isFiltered={isFiltered}
        isPending={notes.isPending}
        error={notes.error}
        noun="notes"
        getKey={(n) => n.id}
        skeleton={<RecordRowSkeleton />}
        testId="notes-list"
        empty={{ icon: StickyNote, title: "No notes yet", description: "Meeting notes, decisions and sprint documents appear here." }}
        render={(n) => <NoteRowItem note={n} projectId={projectId} />}
      />
    </div>
  );
}

function NoteRowItem({ note: n, projectId }: { note: Row; projectId: string }) {
  const href = hrefFromEntry({ kind: "note", id: childId(projectId, n.id) });
  const done = Boolean(n.completedAt);
  const comments = n.commentThreads?.length ?? 0;
  return (
    <RecordRow
      href={href}
      muted={done}
      leading={<NoteTypeIcon type={n.noteType} />}
      title={
        <span className={done ? "line-through" : undefined}>
          {n.title}
        </span>
      }
      description={n.text || undefined}
      meta={
        <>
          <Chip variant="secondary">{noteTypeLabel(n.noteType)}</Chip>
          <Fact>{format(new Date(n.date), "d MMM yyyy")}</Fact>
          {n.author?.name && <Fact label="by">{n.author.name}</Fact>}
          {n.task && <Fact title={n.task.title}>{taskCode(n.task.taskType, n.task.taskNumber)}</Fact>}
          {n.noteType === "DEADLINE" && n.dueDate && <Fact label="Due">{format(new Date(n.dueDate), "d MMM yyyy")}</Fact>}
          {done && (
            <Fact className="text-success">
              <CheckCircle2 className="size-3.5" /> Done
            </Fact>
          )}
          {comments > 0 && <Fact label="Comments">{comments}</Fact>}
        </>
      }
    />
  );
}
