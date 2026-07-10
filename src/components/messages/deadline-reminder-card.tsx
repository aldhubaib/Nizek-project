import Link from "next/link";
import { format } from "date-fns";
import {
  AlarmClock,
  ArrowUpRight,
  Calendar,
  SquareCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deadlineReminderNoteUrl,
  deadlineReminderTheme,
  type DeadlineReminderPayload,
} from "@/lib/deadline-reminder-payload";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DeadlineReminderCard({
  payload,
  createdAt,
}: {
  payload: DeadlineReminderPayload;
  createdAt: string;
}) {
  const theme = deadlineReminderTheme(payload.offsetDays);
  const dueLabel = format(new Date(payload.dueDate), "MMM d, yyyy");
  const noteUrl = deadlineReminderNoteUrl(payload.projectId, payload.noteId);

  return (
    <div
      className={cn(
        "min-w-[min(100%,320px)] max-w-md overflow-hidden rounded-xl border bg-card/95 shadow-sm",
        theme.border,
        "ring-1 ring-inset",
        theme.ring,
      )}
    >
      <div className={cn("h-0.5 w-full bg-current opacity-60", theme.accent)} />

      <div className="space-y-3 p-3.5">
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full bg-muted/40",
              theme.icon,
            )}
          >
            <AlarmClock className="size-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {theme.category}
            </p>
            <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">
              {payload.title}
            </h3>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              theme.pill,
            )}
          >
            {theme.statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="size-3.5 shrink-0 opacity-70" />
          <span>{dueLabel}</span>
        </div>

        <span className="inline-flex rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-foreground">
          @all
        </span>

        <Link
          href={noteUrl}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-medium transition-colors",
            theme.button,
          )}
        >
          <SquareCheck className="size-4 shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1 truncate text-foreground">
            Open note · {payload.title}
          </span>
          <ArrowUpRight className={cn("size-3.5 shrink-0", theme.accent)} />
        </Link>

        <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-2.5">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            This is an automated system message. Mark the note as completed to
            stop receiving this alert.
          </p>
        </div>

        <div className="flex justify-end">
          <span className="text-[10px] text-muted-foreground">
            {formatTime(createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NizekBotAvatar({ show }: { show: boolean }) {
  if (!show) return <div className="w-8 shrink-0" aria-hidden />;
  return (
    <div className="w-8 shrink-0 self-start">
      <div
        className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-sm"
        aria-hidden
      >
        NB
      </div>
    </div>
  );
}
