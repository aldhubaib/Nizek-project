"use client";

import { useState } from "react";
import { ArrowUpRight, MessageSquareText } from "lucide-react";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";
import { taskCommentUrl, type TaskCommentPayload } from "@/lib/task-comment-payload";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TaskCommentCard({
  payload,
  createdAt,
}: {
  payload: TaskCommentPayload;
  createdAt: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const taskUrl = taskCommentUrl(payload.projectId, payload.taskId, payload.threadId);

  return (
    <>
      <div className="w-full rounded-xl border border-orange/35 bg-card/95 shadow-sm ring-1 ring-inset ring-orange/20">
        <div className="h-0.5 w-full bg-orange/70" />
        <div className="space-y-3 p-3.5">
          <div className="flex items-start gap-s">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-orange/10 text-orange">
              <MessageSquareText className="size-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Task comment
              </p>
              <h3 className="mt-0.5 text-s font-semibold leading-snug text-foreground">
                {payload.taskTitle}
              </h3>
            </div>
          </div>

          {payload.quoteText && (
            <blockquote className="border-s-2 border-orange/60 ps-3 text-s italic text-muted-foreground">
              {payload.quoteText}
            </blockquote>
          )}

          <p className="whitespace-pre-wrap text-s leading-relaxed text-foreground">
            {payload.comment}
          </p>

          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-orange/30 bg-orange/5 px-3 py-2.5 text-s font-medium text-orange transition-colors hover:bg-orange/10"
          >
            <span className="min-w-0 flex-1 truncate text-left text-foreground">
              {payload.threadId ? "Open task · reply on the highlight" : "Open task"}
            </span>
            <ArrowUpRight className="size-3.5 shrink-0" />
          </button>

          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">{formatTime(createdAt)}</span>
          </div>
        </div>
      </div>
      {panelOpen ? (
        <TaskInboxSlideOver
          taskId={payload.taskId}
          href={taskUrl}
          title={payload.taskTitle}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </>
  );
}
