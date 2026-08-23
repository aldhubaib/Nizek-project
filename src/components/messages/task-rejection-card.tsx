"use client";

import { useState } from "react";
import { Gavel } from "lucide-react";
import { ActivityCard } from "@/components/messages/activity-card";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";
import { cn } from "@/lib/utils";

const THEME = {
  accent: "text-destructive",
  border: "border-destructive/35",
  ring: "ring-destructive/20",
  iconWrap: "bg-destructive/10 text-destructive",
  button: "border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive",
  quote: "border-destructive/60",
};

function rejectionReason(body: string, mentions?: string[]) {
  const who = mentions?.find((n) => body.startsWith(`@${n}`));
  return (who ? body.slice(who.length + 1) : body).trim();
}

export function TaskRejectionCard({
  title,
  taskNumber,
  projectId,
  taskId,
  body,
  mentions,
  createdAt,
}: {
  title: string;
  taskNumber?: number | null;
  projectId?: string | null;
  taskId?: string | null;
  body: string;
  mentions?: string[];
  createdAt: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const reason = rejectionReason(body, mentions);
  const href =
    projectId && taskId ? `/dashboard/projects/${projectId}/tasks/${taskId}` : undefined;
  const heading = taskNumber
    ? `${`T-${String(taskNumber).padStart(3, "0")}`} ${title}`
    : title;

  return (
    <>
      <ActivityCard
        theme={THEME}
        icon={Gavel}
        category="Task rejected"
        title={heading}
        createdAt={createdAt}
        actionLabel="Open task"
        onAction={taskId ? () => setPanelOpen(true) : undefined}
        href={!taskId ? href : undefined}
      >
        {reason ? (
          <blockquote className={cn("border-s-2 ps-3 text-s italic text-muted-foreground", THEME.quote)}>
            {reason}
          </blockquote>
        ) : null}
      </ActivityCard>
      {panelOpen && taskId && href ? (
        <TaskInboxSlideOver
          taskId={taskId}
          href={href}
          title={title}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </>
  );
}
