"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import { ActivityCard } from "@/components/messages/activity-card";
import { AttachmentBubble } from "@/components/messages/chat-attachments";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/actions/messages";

const THEME = {
  accent: "text-cyan",
  border: "border-cyan/35",
  ring: "ring-cyan/20",
  iconWrap: "bg-cyan/10 text-cyan",
  button: "border-cyan/30 bg-cyan/5 hover:bg-cyan/10 text-cyan",
  quote: "border-cyan/60",
};

const AUTO_BODY = /^Proof of work(\s+\(\d+ videos\))?\s+for\s+/i;

export function isProofOfWorkChatMessage(m: {
  body?: string | null;
  task?: { id: string } | null;
  attachments?: { contentType?: string | null }[];
}) {
  if (!m.task) return false;
  const hasVideo = (m.attachments ?? []).some((a) =>
    (a.contentType ?? "").startsWith("video/"),
  );
  return hasVideo || AUTO_BODY.test((m.body ?? "").trim());
}

function fmtTaskNumber(n: number) {
  return `T-${String(n).padStart(3, "0")}`;
}

export function ProofOfWorkCard({
  taskId,
  projectId,
  taskNumber,
  taskTitle,
  body,
  videos,
  createdAt,
}: {
  taskId: string;
  projectId: string;
  taskNumber: number;
  taskTitle: string;
  body: string;
  videos: MessageAttachment[];
  createdAt: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const href = `/dashboard/projects/${projectId}/tasks/${taskId}`;
  const title = `${fmtTaskNumber(taskNumber)} ${taskTitle}`.trim();
  const quote = AUTO_BODY.test(body.trim()) ? "" : body.trim();

  return (
    <>
      <ActivityCard
        theme={THEME}
        icon={Film}
        category="Proof of work"
        title={title}
        createdAt={createdAt}
        actionLabel="Open task"
        onAction={() => setPanelOpen(true)}
      >
        {quote ? (
          <blockquote
            className={cn(
              "border-s-2 ps-3 text-s italic text-muted-foreground",
              THEME.quote,
            )}
          >
            {quote}
          </blockquote>
        ) : null}
        {videos.length > 0 ? (
          <div
            className={cn(
              videos.length > 1 ? "grid grid-cols-2 gap-1.5" : "flex flex-col",
            )}
          >
            {videos.map((a) => (
              <AttachmentBubble
                key={a.id}
                attachment={a}
                mine={false}
                embedded
              />
            ))}
          </div>
        ) : null}
      </ActivityCard>
      {panelOpen ? (
        <TaskInboxSlideOver
          taskId={taskId}
          href={href}
          title={taskTitle}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </>
  );
}
