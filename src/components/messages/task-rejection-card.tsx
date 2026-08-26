"use client";

import { useState } from "react";
import { Gavel } from "lucide-react";
import { ActivityCard } from "@/components/messages/activity-card";
import {
  AttachmentBubble,
  isVideoAttachment,
} from "@/components/messages/chat-attachments";
import { TaskInboxSlideOver } from "@/components/messages/task-inbox-slide-over";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/actions/messages";

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
  attachments,
  createdAt,
  onOpenImage,
}: {
  title: string;
  taskNumber?: number | null;
  projectId?: string | null;
  taskId?: string | null;
  body: string;
  mentions?: string[];
  attachments?: MessageAttachment[];
  createdAt: string;
  onOpenImage?: (att: MessageAttachment) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const reason = rejectionReason(body, mentions);
  const href =
    projectId && taskId ? `/dashboard/projects/${projectId}/tasks/${taskId}` : undefined;
  const heading = taskNumber
    ? `${`T-${String(taskNumber).padStart(3, "0")}`} ${title}`
    : title;
  const images = (attachments ?? []).filter((a) => a.isImage);
  const videos = (attachments ?? []).filter((a) => isVideoAttachment(a));
  const files = (attachments ?? []).filter((a) => !a.isImage && !isVideoAttachment(a));

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
        {images.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {images.map((a) => (
              <AttachmentBubble
                key={a.id}
                attachment={a}
                mine={false}
                embedded
                onOpenImage={onOpenImage}
              />
            ))}
          </div>
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
        {files.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {files.map((a) => (
              <AttachmentBubble
                key={a.id}
                attachment={a}
                mine={false}
                onOpenImage={onOpenImage}
              />
            ))}
          </div>
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
