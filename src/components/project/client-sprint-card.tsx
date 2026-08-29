"use client";

import { Sparkles } from "lucide-react";
import type { SprintDTO } from "@/actions/sprint";

/**
 * Client road-map sprint card. Title only — click opens planning
 * (in progress) or the sprint documents (completed / shipped).
 */
export function ClientSprintCard({
  sprint,
  taskCount,
  onOpen,
}: {
  sprint: SprintDTO;
  taskCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 rounded-md border border-border bg-field px-3 py-4 text-start transition-colors hover:border-foreground/40"
    >
      <span className="min-w-0 flex-1 truncate text-s font-semibold">
        {sprint.name}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-s tabular-nums text-muted-foreground">
        <Sparkles className="size-4 text-primary" />
        {taskCount}
      </span>
    </button>
  );
}
