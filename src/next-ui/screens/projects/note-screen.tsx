"use client";

import { format } from "date-fns";
import { CheckCircle2, StickyNote } from "lucide-react";

import { taskCode } from "@/lib/task-label";
import { Chip, DetailSection, Fact, HeaderCardSkeleton, RecordRow } from "@/next-ui/blocks";
import { useNote } from "@/next-ui/data/notes";
import { SafeHtml } from "@/next-ui/lib/safe-html";
import { childId, hrefFromEntry, splitChildId, usePane } from "@/next-ui/panes";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Button } from "@/next-ui/ui/button";
import { Skeleton } from "@/next-ui/ui/skeleton";

import { noteTypeLabel, NoteTypeIcon } from "./note-marks";
import { TaskTypeIcon } from "./task-marks";

/**
 * One note, read here: its kind, title, who wrote it and when, the body as written, and the
 * tasks it is about. Editing, comments and the sprint document tools are in the current
 * panel, one click away.
 */
export function NoteScreen({ id }: { id: string }) {
  const ids = splitChildId(id);
  const projectId = ids?.parent ?? "";
  const noteId = ids?.child ?? "";
  const note = useNote(projectId, noteId);
  const pane = usePane();

  if (note.isPending) {
    return (
      <>
        <PageHeader title="Note" />
        <div className="flex flex-col gap-6" aria-busy>
          <HeaderCardSkeleton />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </>
    );
  }
  if (note.error || !note.data) {
    return (
      <>
        <PageHeader title="Note" />
        <EmptyState
          icon={StickyNote}
          title="Could not open this note"
          description={note.error instanceof Error ? note.error.message : "It may have been deleted."}
          action={
            <Button variant="outline" onClick={pane.back}>
              Back
            </Button>
          }
        />
      </>
    );
  }

  const n = note.data;
  const linked = [
    ...(n.task ? [n.task] : []),
    ...(n.taskLinks ?? []).map((l) => l.task).filter((t) => t && t.id !== n.task?.id),
  ];
  const done = Boolean(n.completedAt);

  return (
    <>
      <PageHeader title={n.title} />

      <article className="flex flex-col gap-6">
        <header className="flex items-start gap-4">
          <NoteTypeIcon type={n.noteType} className="size-12 [&>svg]:size-6" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-xl font-semibold leading-tight" dir="auto">
              {n.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <Chip variant="secondary">{noteTypeLabel(n.noteType)}</Chip>
              <span>{format(new Date(n.date), "d MMM yyyy")}</span>
              {n.author && (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar className="size-4">
                    {n.author.imageUrl && <AvatarImage src={n.author.imageUrl} alt="" />}
                    <AvatarFallback className="text-[9px]">{(n.author.name ?? "?").charAt(0)}</AvatarFallback>
                  </Avatar>
                  {n.author.name ?? "Unknown"}
                </span>
              )}
              {n.noteType === "DEADLINE" && n.dueDate && <span>Due {format(new Date(n.dueDate), "d MMM yyyy")}</span>}
              {done && (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="size-3.5" />
                  Done {n.completedAt ? format(new Date(n.completedAt), "d MMM yyyy") : ""}
                </span>
              )}
              {n.updatedAt && new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 60_000 && (
                <span>Edited {format(new Date(n.updatedAt), "d MMM yyyy")}</span>
              )}
            </div>
          </div>
        </header>

        <div className="rounded-xl border bg-card p-4 @xl:p-6" data-testid="note-body">
          {n.content && n.content.replace(/<[^>]+>/g, "").trim() ? (
            <SafeHtml html={n.content} />
          ) : (
            <p className="text-sm text-muted-foreground">This note has no text.</p>
          )}
        </div>

        {linked.length > 0 && (
          <DetailSection title="Tasks" meta={linked.length}>
            <div className="flex flex-col gap-2" role="list">
              {linked.map((t) => (
                <RecordRow
                  key={t.id}
                  href={hrefFromEntry({ kind: "task", id: childId(projectId || n.projectId, t.id) })}
                  leading={
                    <span className="grid size-10 place-items-center rounded-lg bg-muted">
                      <TaskTypeIcon taskType={t.taskType} className="size-5" />
                    </span>
                  }
                  title={t.title}
                  meta={<Fact>{taskCode(t.taskType, t.taskNumber)}</Fact>}
                />
              ))}
            </div>
          </DetailSection>
        )}
      </article>
    </>
  );
}
