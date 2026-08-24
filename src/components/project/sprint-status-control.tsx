"use client";

import { CheckCircle2, CircleDashed, Play, Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import { isClosedSprint } from "@/lib/sprint-status";

function daysUntil(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((endDay - nowDay) / (1000 * 60 * 60 * 24));
}

function daysLeftLabel(endDate: string): { text: string; overdue: boolean } {
  const days = daysUntil(endDate);
  if (days > 1) return { text: `${days}d left`, overdue: false };
  if (days === 1) return { text: "1d left", overdue: false };
  if (days === 0) return { text: "Today", overdue: false };
  if (days === -1) return { text: "1d over", overdue: true };
  return { text: `${Math.abs(days)}d over`, overdue: true };
}

interface Props {
  status: string;
  endDate: string;
  disabled?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
}

export function SprintStatusControl({
  status,
  endDate,
  disabled,
  onStart,
  onComplete,
}: Props) {
  const iconBtn =
    "grid size-8 shrink-0 place-items-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40";

  if (status === "SHIPPED") {
    return (
      <span
        className={cn(iconBtn, "text-success")}
        title="Shipped"
        aria-label="Shipped"
      >
        <Ship className="size-4" />
      </span>
    );
  }

  if (isClosedSprint(status)) {
    const partial = status === "PARTIALLY_COMPLETED";
    const Icon = partial ? CircleDashed : CheckCircle2;
    return (
      <span
        className={cn(iconBtn, partial ? "text-orange" : "text-success")}
        title={partial ? "Partially completed" : "Completed"}
        aria-label={partial ? "Partially completed" : "Completed"}
      >
        <Icon className="size-4" />
      </span>
    );
  }

  if (status === "ACTIVE") {
    const { text, overdue } = daysLeftLabel(endDate);
    const className = cn(
      "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold tabular-nums",
      overdue ? "text-destructive" : "text-success",
      onComplete && "transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
    );
    const body = (
      <>
        <Play className="size-3.5" />
        {text}
      </>
    );
    if (!onComplete) {
      return (
        <span className={className} title={text}>
          {body}
        </span>
      );
    }
    return (
      <button
        type="button"
        aria-label={`Complete sprint · ${text}`}
        title={`Complete sprint · ${text}`}
        disabled={disabled}
        onClick={onComplete}
        className={className}
      >
        {body}
      </button>
    );
  }

  if (!onStart) {
    return (
      <span
        className={cn(iconBtn, "text-muted-foreground")}
        title={status === "NEXT" ? "Next" : "Planned"}
      >
        <Play className="size-4" />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label="Start sprint"
      title="Start sprint"
      disabled={disabled}
      onClick={onStart}
      className={cn(iconBtn, "text-muted-foreground hover:bg-muted hover:text-foreground")}
    >
      <Play className="size-4" />
    </button>
  );
}
