"use client";

import * as React from "react";
import { format } from "date-fns";
import { CheckCircle2, Circle, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";

import { taskCode } from "@/lib/task-label";
import {
  byNumber,
  byText,
  Chip,
  Collection,
  Fact,
  RecordCardSkeleton,
  RecordMenu,
  RecordRow,
  RecordRowSkeleton,
  TextCard,
  useList,
  type SortDef,
} from "@/next-ui/blocks";
import { useProjectNotes, useToggleNoteDone, type NoteRow } from "@/next-ui/data/notes";
import { excerpt, htmlToParagraphs } from "@/next-ui/lib/safe-html";
import { childId, hrefFromEntry } from "@/next-ui/panes";
import { filterGroup, optionsOf, usePageFilters } from "@/next-ui/patterns/filter-menu";
import { ErrorNote, errorText } from "@/next-ui/patterns/form-bits";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { usePageView } from "@/next-ui/patterns/view-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/next-ui/ui/dropdown-menu";

import { DeleteNoteDialog, NoteDialog, WRITABLE_NOTE_TYPES } from "./note-dialogs";
import { NOTE_TYPES, noteType, noteTypeLabel, NoteTypeIcon } from "./note-marks";
import type { ViewerRights } from "./project-screen";

/** A note with its body read once: the paragraphs (the card) and the plain text (the row, search). */
type Row = NoteRow & { paragraphs: string[]; text: string };

const SORTS: SortDef<Row>[] = [
  { id: "newest", label: "Newest", compare: byNumber((n) => new Date(n.date).getTime()) },
  { id: "updated", label: "Last edited", compare: byNumber((n) => new Date(n.updatedAt).getTime()) },
  { id: "title", label: "Title", compare: byText((n) => n.title) },
];

const KIND_ORDER = Object.keys(NOTE_TYPES);
const STATUS_OPTIONS = [
  { value: "open", label: "Open", icon: <Circle /> },
  { value: "done", label: "Done", icon: <CheckCircle2 /> },
];

const searchText = (n: Row) => [n.title, n.text, n.author?.name, n.task?.title].filter(Boolean).join(" ");

/**
 * The project's notes as a wall of cards (the usual view) or as rows (the View menu). A card
 * reads like the note's first page: its kind, the title, the opening paragraphs fading out,
 * then when it was written and the writer's avatar (the name on hover),
 * with the task it is about, a roadmap item's due date, whether it is done and its comments. The Filter menu narrows to one
 * kind, to open or done, or to one author; the search is in the pane header. A click opens the
 * note beside this pane. Staff write notes from the header and edit them from a note's ⋯,
 * which also marks a road-map item done; admins and project managers delete there. Sprint
 * documents are written by their sprint.
 */
export function NotesView({ projectId, rights }: { projectId: string; rights?: ViewerRights }) {
  const notes = useProjectNotes(projectId);
  const filters = usePageFilters(`notes:${projectId}`);
  const view = usePageView("notes", "cards");
  const toggleDone = useToggleNoteDone(projectId);
  const [dialog, setDialog] = React.useState<null | { kind: "new" } | { kind: "edit" | "delete"; note: NoteRow }>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const canWrite = rights?.canWriteNotes ?? false;
  const canDelete = rights?.canEditSettings ?? false;

  const rows = React.useMemo<Row[] | undefined>(
    () =>
      notes.data?.map((n) => {
        const paragraphs = htmlToParagraphs(n.content);
        return { ...n, paragraphs, text: paragraphs.join(" ") };
      }),
    [notes.data],
  );
  const groups = React.useMemo(
    () => [
      filterGroup(
        filters,
        "kind",
        optionsOf(
          rows,
          (n) => n.noteType,
          (v) => {
            const cfg = noteType(v);
            const Icon = cfg.icon;
            return { label: cfg.label, icon: <Icon className={cfg.color} /> };
          },
          KIND_ORDER,
        ),
      ),
      filterGroup(filters, "status", rows?.some((n) => n.completedAt) ? STATUS_OPTIONS : [], "Status"),
      filterGroup(filters, "author", optionsOf(rows, (n) => n.author?.name), "Author"),
    ],
    [rows, filters],
  );
  const scoped = React.useMemo(
    () =>
      rows?.filter(
        (n) =>
          filters.passes("kind", n.noteType) &&
          filters.passes("status", n.completedAt ? "done" : "open") &&
          filters.passes("author", n.author?.name),
      ),
    [rows, filters],
  );
  const list = useList(scoped, { searchText, sorts: SORTS, defaultSort: "newest" });
  const isFiltered = list.isFiltered || filters.active;
  const clear = () => {
    list.reset();
    filters.clear();
  };

  const menuFor = (n: NoteRow) => {
    const editable = canWrite && (WRITABLE_NOTE_TYPES as readonly string[]).includes(n.noteType);
    if (!editable && !canDelete) return undefined;
    return (
      <RecordMenu href={noteHref(projectId, n)} contentClassName="min-w-44">
        {editable && (
          <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", note: n })} data-testid="edit-note">
            <Pencil />
            Edit
          </DropdownMenuItem>
        )}
        {editable && n.noteType === "DEADLINE" && (
          <DropdownMenuItem onSelect={() => toggleDone.mutate(n.id, { onError: (err) => setNotice(errorText(err)) })} data-testid="toggle-note-done">
            {n.completedAt ? <Circle /> : <CheckCircle2 />}
            {n.completedAt ? "Mark as open" : "Mark as done"}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            {editable && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete", note: n })} data-testid="delete-note">
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </RecordMenu>
    );
  };

  return (
    <div className="flex flex-col">
      <ListTools
        what="notes"
        search={list.query.search}
        onSearch={list.setSearch}
        groups={groups}
        view={view}
        sorts={SORTS}
        sort={list.query.sort ?? "newest"}
        onSort={list.setSort}
        action={canWrite && <HeaderAction label="New note" icon={<Plus />} onClick={() => setDialog({ kind: "new" })} data-testid="new-note-button" />}
      />
      {notice && (
        <ErrorNote className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </ErrorNote>
      )}
      <Collection
        layout={view.cards ? "grid" : "rows"}
        min={view.min}
        items={list.rows}
        total={rows?.length}
        isFiltered={isFiltered}
        onClearFilters={clear}
        isPending={notes.isPending}
        error={notes.error}
        noun="notes"
        getKey={(n) => n.id}
        skeleton={view.cards ? <RecordCardSkeleton /> : <RecordRowSkeleton />}
        testId="notes-list"
        empty={{ icon: StickyNote, title: "No notes yet", description: "Meeting notes, decisions and sprint documents appear here." }}
        render={(n) => <NoteItem note={n} projectId={projectId} cards={view.cards} menu={menuFor(n)} />}
      />
      <NoteDialog projectId={projectId} note={dialog?.kind === "edit" ? dialog.note : null} open={dialog?.kind === "new" || dialog?.kind === "edit"} onClose={() => setDialog(null)} />
      <DeleteNoteDialog projectId={projectId} note={dialog?.kind === "delete" ? dialog.note : null} open={dialog?.kind === "delete"} onClose={() => setDialog(null)} />
    </div>
  );
}

/** "28 Oct" for this year's dates, "28 Oct 2025" for older ones. */
function shortDate(value: Date | string): string {
  const d = new Date(value);
  return format(d, d.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy");
}

/** Where a note opens: a sprint's document is its sprint page; every other note is its own page. */
export function noteHref(projectId: string, n: Pick<NoteRow, "id" | "noteType" | "sprintId">): string {
  if (n.noteType === "SPRINT_DOC" && n.sprintId) return hrefFromEntry({ kind: "sprint", id: childId(projectId, n.sprintId) });
  return hrefFromEntry({ kind: "note", id: childId(projectId, n.id) });
}

function NoteItem({ note: n, projectId, cards, menu }: { note: Row; projectId: string; cards: boolean; menu?: React.ReactNode }) {
  const href = noteHref(projectId, n);
  const done = Boolean(n.completedAt);
  const comments = n.commentThreads?.length ?? 0;
  const title = <span className={done ? "line-through" : undefined}>{n.title}</span>;
  // the facts beyond the date: the task, a roadmap item's due date, done, the comments
  const facts = (
    <>
      {n.task && <Fact title={n.task.title}>{taskCode(n.task.taskType, n.task.taskNumber)}</Fact>}
      {n.noteType === "DEADLINE" && n.dueDate && <Fact label="Due">{shortDate(n.dueDate)}</Fact>}
      {done && (
        <Fact className="text-success">
          <CheckCircle2 className="size-3.5" /> Done
        </Fact>
      )}
      {comments > 0 && <Fact label="Comments">{comments}</Fact>}
    </>
  );
  if (cards) {
    const kind = noteType(n.noteType);
    const KindIcon = kind.icon;
    return (
      <TextCard
        href={href}
        muted={done}
        kind={
          <Chip variant="secondary">
            <KindIcon className={kind.color} />
            {kind.label}
          </Chip>
        }
        count={menu && <span className="-my-2 -me-2 flex items-center opacity-70 group-hover/card:opacity-100 group-focus-within/card:opacity-100">{menu}</span>}
        title={title}
        paragraphs={n.paragraphs}
        footer={
          <>
            <span className="flex min-w-0 items-center gap-2">
              <time dateTime={new Date(n.date).toISOString()} title={format(new Date(n.date), "d MMM yyyy")}>
                {shortDate(n.date)}
              </time>
              {n.author && (
                <Avatar className="size-5" role="img" aria-label={n.author.name ?? "Unnamed"} title={n.author.name ?? undefined} data-testid="note-author">
                  {n.author.imageUrl && <AvatarImage src={n.author.imageUrl} alt="" />}
                  <AvatarFallback className="text-[10px]">{(n.author.name ?? "?").trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
                </Avatar>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">{facts}</span>
          </>
        }
      />
    );
  }
  const meta = (
    <>
      <Chip variant="secondary">{noteTypeLabel(n.noteType)}</Chip>
      <Fact>{format(new Date(n.date), "d MMM yyyy")}</Fact>
      {n.author?.name && <Fact label="by">{n.author.name}</Fact>}
      {facts}
    </>
  );
  return (
    <RecordRow
      href={href}
      muted={done}
      leading={<NoteTypeIcon type={n.noteType} />}
      title={title}
      description={n.text ? excerpt(n.text, 200) : undefined}
      meta={meta}
      menu={menu}
    />
  );
}
