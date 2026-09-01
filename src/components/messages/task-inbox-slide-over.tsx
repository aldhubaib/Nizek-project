"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { getTaskDetailPanel } from "@/actions/task-detail-panel";
import { NoteSlideOver } from "@/components/project/note-slide-over";

const TaskDetailPage = dynamic(
  () =>
    import("@/app/(dashboard)/dashboard/projects/[projectId]/tasks/[taskId]/task-detail-view").then(
      (mod) => mod.TaskDetailPage,
    ),
  { ssr: false },
);

export function TaskInboxSlideOver({
  taskId,
  title,
  onClose,
}: {
  taskId: string;
  href?: string;
  title?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTaskDetailPanel>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTaskDetailPanel(taskId)
      .then((panel) => {
        if (!cancelled) setData(panel);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load task");
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <NoteSlideOver title={data?.task.title ?? title ?? "Task"} onClose={onClose}>
      {!data && !error ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-s text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading task…
        </div>
      ) : error ? (
        <p className="px-4 py-10 text-center text-s text-destructive">{error}</p>
      ) : data ? (
        <TaskDetailPage
          task={data.task}
          projectId={data.projectId}
          projectName={data.projectName}
          questions={data.questions}
          initialAnswers={data.initialAnswers}
          initialNotes={data.initialNotes}
          isAdmin={data.isAdmin}
          canDelete={data.canDelete}
          embedded
          onClose={onClose}
        />
      ) : null}
    </NoteSlideOver>
  );
}
