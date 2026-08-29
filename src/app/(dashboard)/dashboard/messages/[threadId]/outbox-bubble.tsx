"use client";

import { memo } from "react";
import { Loader2, FileText, Clock, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReplyContext } from "@/components/messages/reply-context";
import { LinkPreviewCard } from "@/components/messages/link-preview";
import { firstUrl } from "@/lib/link-preview";
import type { OutboxEntry } from "@/lib/message-outbox";
import type { ChatMessage } from "./thread-shared";

// An optimistically-sent message still uploading/delivering, rendered as a
// "mine" bubble with per-file progress — the WhatsApp send experience.
export const OutboxBubble = memo(function OutboxBubble({
  entry,
  replied,
  currentMemberId,
  onRetry,
  onDiscard,
}: {
  entry: OutboxEntry;
  replied: ChatMessage | null | undefined;
  currentMemberId: string;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
}) {
  const failed = entry.status === "error";
  const imageFiles = entry.files.filter(
    (f) => f.contentType?.startsWith("image/") && f.previewUrl,
  );
  const otherFiles = entry.files.filter(
    (f) => !(f.contentType?.startsWith("image/") && f.previewUrl),
  );
  const nestImages = Boolean(entry.body) && imageFiles.length > 0;

  const pendingImage = (f: (typeof entry.files)[number], embedded: boolean) => {
    const pct = f.status === "done" ? 100 : f.progress;
    return (
      <div
        key={f.key}
        className={cn(
          "relative overflow-hidden rounded-xl",
          embedded ? "w-full" : "border border-border/50 bg-surface",
        )}
        style={embedded ? undefined : { maxWidth: 240 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={f.previewUrl!}
          alt={f.name}
          className={cn(
            "object-cover",
            embedded ? "max-h-80 w-full" : "max-h-60 w-auto max-w-[240px]",
          )}
        />
        {!failed && entry.status === "uploading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
            <span className="text-s font-semibold text-white">{pct}%</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex justify-end gap-2">
      <div className="flex max-w-[70%] flex-col items-end gap-1">
        {otherFiles.length > 0 && (
          <div className="flex max-w-full flex-col gap-xs">
            {otherFiles.map((f) => {
              const pct = f.status === "done" ? 100 : f.progress;
              return (
                <div
                  key={f.key}
                  className="flex items-center gap-s rounded-xl border border-primary-foreground/20 bg-primary/80 px-3 py-2 text-s text-primary-foreground"
                >
                  {entry.status === "uploading" && !failed ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 opacity-80" />
                  )}
                  <span className="max-w-[200px] truncate font-medium">
                    {f.name}
                  </span>
                  {entry.status === "uploading" && !failed && (
                    <span className="shrink-0 text-xs opacity-80">{pct}%</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!nestImages && imageFiles.length > 0 && (
          <div className="flex max-w-full flex-col gap-xs">
            {imageFiles.map((f) => pendingImage(f, false))}
          </div>
        )}
        {(entry.body || replied) && (
          <div className="flex min-w-0 max-w-full flex-col items-end gap-1">
            {replied && (
              <ReplyContext
                authorLabel={
                  replied.authorId === currentMemberId ? "You" : replied.authorName
                }
                body={replied.body}
                attachments={replied.attachments}
                mine
              />
            )}
            {entry.body && (
              <div
                className={cn(
                  "flex max-w-full rounded-2xl rounded-br-md bg-primary text-s leading-relaxed text-primary-foreground opacity-90",
                  nestImages
                    ? "w-[min(100%,20rem)] flex-col gap-2 p-2"
                    : "flex-row items-end gap-2 px-3.5 py-2",
                )}
              >
                <div className={cn("flex items-end gap-2", nestImages && "px-1.5 pt-0.5")}>
                  <span className="whitespace-pre-wrap break-words">{entry.body}</span>
                  <Clock className="ml-1 h-3 w-3 shrink-0 translate-y-0.5 opacity-70" />
                </div>
                {nestImages && (
                  <div className="flex flex-col gap-1.5">
                    {imageFiles.map((f) => pendingImage(f, true))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {entry.body &&
          (() => {
            const previewUrl = firstUrl(entry.body);
            return previewUrl ? <LinkPreviewCard url={previewUrl} mine /> : null;
          })()}
        {failed ? (
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2 text-s text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words text-right">
              {entry.errorMessage || "Failed to send"}
            </span>
            <button
              type="button"
              onClick={() => onRetry(entry.tempId)}
              className="flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => onDiscard(entry.tempId)}
              className="font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="px-1 text-xs text-muted-foreground">
            {entry.status === "uploading" ? "Uploading…" : "Sending…"}
          </div>
        )}
      </div>
    </div>
  );
});
