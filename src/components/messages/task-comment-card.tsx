import Link from "next/link";
import { ArrowUpRight, MessageSquareText } from "lucide-react";
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
  const taskUrl = taskCommentUrl(payload.projectId, payload.taskId, payload.threadId);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-amber-500/35 bg-card/95 shadow-sm ring-1 ring-inset ring-amber-500/20">
      <div className="h-0.5 w-full bg-amber-400/70" />
      <div className="space-y-3 p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-400">
            <MessageSquareText className="size-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Task comment
            </p>
            <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">
              {payload.taskTitle}
            </h3>
          </div>
        </div>

        {payload.quoteText && (
          <blockquote className="border-l-2 border-amber-400/60 pl-3 text-[12px] italic text-muted-foreground">
            {payload.quoteText}
          </blockquote>
        )}

        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
          {payload.comment}
        </p>

        <Link
          href={taskUrl}
          className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[12px] font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
        >
          <span className="min-w-0 flex-1 truncate text-foreground">
            Open task · reply on the highlight
          </span>
          <ArrowUpRight className="size-3.5 shrink-0" />
        </Link>

        <div className="flex justify-end">
          <span className="text-[10px] text-muted-foreground">{formatTime(createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
