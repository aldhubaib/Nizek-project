"use client";

import { FileText, Mic, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/actions/messages";
import { isVoiceAttachment } from "@/components/messages/chat-attachments";

export type ReplyPreview = {
  kind: "text" | "photo" | "video" | "file";
  preview: string;
  thumb: MessageAttachment | null;
  isVideo: boolean;
  isVoice: boolean;
};

export function getReplyPreview(
  body: string | undefined,
  attachments: MessageAttachment[] | undefined,
): ReplyPreview {
  const atts = attachments ?? [];
  const image = atts.find((a) => a.isImage) ?? null;
  const video = !image
    ? (atts.find((a) => (a.contentType ?? "").startsWith("video/")) ?? null)
    : null;
  const file = !image && !video ? (atts[0] ?? null) : null;
  const trimmed = body?.trim() ?? "";

  if (image) {
    return {
      kind: "photo",
      preview: trimmed || "Photo",
      thumb: image,
      isVideo: false,
      isVoice: false,
    };
  }
  if (video) {
    return {
      kind: "video",
      preview: trimmed || video.name || "Video",
      thumb: video,
      isVideo: true,
      isVoice: false,
    };
  }
  if (file) {
    const voice = isVoiceAttachment(file);
    return {
      kind: "file",
      preview: trimmed || file.name || (voice ? "Voice note" : "File"),
      thumb: null,
      isVideo: false,
      isVoice: voice,
    };
  }
  return {
    kind: "text",
    preview: trimmed || "Message",
    thumb: null,
    isVideo: false,
    isVoice: false,
  };
}

export function ReplyContext({
  authorLabel,
  body,
  attachments,
  mine = false,
  variant = "bubble",
  onClick,
  onDismiss,
  className,
}: {
  authorLabel: string;
  body?: string;
  attachments?: MessageAttachment[];
  mine?: boolean;
  variant?: "bubble" | "composer";
  onClick?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const { kind, preview, thumb, isVideo, isVoice } = getReplyPreview(
    body,
    attachments,
  );
  const composer = variant === "composer";
  const FileIcon = isVoice ? Mic : FileText;

  const bodyBlock = (
    <>
      <span
        className={cn(
          "flex min-w-0 flex-col justify-center gap-0.5",
          composer && "flex-1",
        )}
      >
        <span className="truncate text-xs font-semibold text-primary">
          {authorLabel}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {kind === "file" && (
            <FileIcon className="h-3 w-3 shrink-0 opacity-80" />
          )}
          <span className="line-clamp-2 min-w-0 break-words">{preview}</span>
        </span>
      </span>
      {thumb && (
        <span className="relative size-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
          {isVideo ? (
            <video
              src={`${thumb.url}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb.url} alt="" className="h-full w-full object-cover" />
          )}
          {isVideo && (
            <span className="absolute inset-0 grid place-items-center bg-black/40">
              <Play className="h-3.5 w-3.5 fill-white text-white" />
            </span>
          )}
        </span>
      )}
    </>
  );

  const boxClass = cn(
    "flex max-w-full items-stretch gap-2 overflow-hidden rounded-[10px] border border-border/60 border-l-2 border-l-primary bg-surface p-1.5 pl-2.5 text-left",
    composer ? "w-full" : "w-max",
    !composer && (mine ? "self-end" : "self-start"),
    onDismiss && "pr-1",
    className,
  );

  return (
    <div className={boxClass}>
      {onClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={cn(
            "flex min-w-0 items-stretch gap-2 text-left transition-colors hover:bg-surface-2",
            composer && "flex-1",
          )}
        >
          {bodyBlock}
        </button>
      ) : (
        <span className={cn("flex min-w-0 items-stretch gap-2", composer && "flex-1")}>
          {bodyBlock}
        </span>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="grid size-7 shrink-0 self-center place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          aria-label="Cancel reply"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
