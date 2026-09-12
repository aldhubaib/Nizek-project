"use client";

import { useCallback, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/file-size";
import { UploadError, uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";
import {
  addBoardCardAttachment,
  deleteBoardCardAttachment,
  type BoardCardAttachmentDTO,
} from "@/actions/board-card";

interface Props {
  cardId: string;
  attachments: BoardCardAttachmentDTO[];
  canEdit: boolean;
  currentUserId: string;
  canManageOthers: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}

function isImage(attachment: BoardCardAttachmentDTO): boolean {
  return (
    attachment.mimeType?.startsWith("image/") ??
    /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(attachment.filename)
  );
}

/**
 * Files on a card.
 *
 * Every card has this whether or not its type declares a `file` field, so it
 * sits beside the description rather than among the answers.
 */
export function CardAttachments({
  cardId,
  attachments,
  canEdit,
  currentUserId,
  canManageOthers,
  onChanged,
  onError,
}: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<BoardCardAttachmentDTO | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        setUploading(file.name);
        try {
          const stored = await uploadFileToR2(file);
          const result = await addBoardCardAttachment({
            cardId,
            filename: stored.filename,
            url: stored.url,
            fileSize: stored.fileSize,
            mimeType: stored.mimeType,
          });
          if (!result.success) onError(result.error);
        } catch (err) {
          onError(
            err instanceof UploadError
              ? err.message
              : `Could not upload ${file.name}`,
          );
        }
      }
      setUploading(null);
      if (inputRef.current) inputRef.current.value = "";
      onChanged();
    },
    [cardId, onChanged, onError],
  );

  // A pasted screenshot is the common case for a board card, so it uploads
  // straight from the clipboard rather than needing a round trip through a file
  // dialog.
  const pasteRef = usePasteFiles<HTMLDivElement>(addFiles, {
    enabled: canEdit && !uploading,
  });

  async function remove(attachment: BoardCardAttachmentDTO) {
    const result = await deleteBoardCardAttachment(attachment.id);
    if (!result.success) {
      onError(result.error);
      return;
    }
    onChanged();
  }

  if (!canEdit && attachments.length === 0) return null;

  return (
    <section
      ref={pasteRef}
      onDragOver={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        setDragging(true);
      }}
      // Crossing from the section onto a child fires dragleave too, which would
      // flicker the highlight off and on across every row.
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) void addFiles(files);
      }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2">
        <Paperclip className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        <h3 className="text-s font-medium text-foreground">Attachments</h3>
        {attachments.length > 0 && (
          <span className="text-xs text-muted-foreground/70">
            {attachments.length}
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(uploading)}
            className="ms-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Plus className="size-3" />
            )}
            Add
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) void addFiles(Array.from(files));
        }}
      />

      {attachments.length === 0 ? (
        /* The zone is the button, so the whole rectangle takes a click as well
           as a drop — a dashed box that only accepted one of the two would be
           a target that looks bigger than it is. */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(uploading)}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="text-s text-muted-foreground">
                Uploading {uploading}…
              </span>
            </>
          ) : (
            <>
              <Upload
                className={cn(
                  "size-5",
                  dragging ? "text-primary" : "text-muted-foreground/60",
                )}
                strokeWidth={1.5}
              />
              <span className="text-s text-foreground/80">
                {dragging ? "Drop to attach" : "Drop files here, or click to browse"}
              </span>
              <span className="text-xs text-muted-foreground/60">
                You can paste a screenshot too
              </span>
            </>
          )}
        </button>
      ) : (
        <ul
          className={cn(
            "space-y-1.5 rounded-lg transition-colors",
            // A list that already has rows is its own drop zone; it says so
            // only while something is over it.
            dragging &&
              "border border-dashed border-primary bg-primary/5 p-1.5",
          )}
        >
          {dragging && (
            <li className="py-2 text-center text-s text-primary">Drop to attach</li>
          )}
          {uploading && (
            <li className="flex items-center gap-2 rounded-md border border-border bg-field px-3 py-2 text-s text-muted-foreground">
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate">Uploading {uploading}…</span>
            </li>
          )}
          {attachments.map((attachment) => {
            const image = isImage(attachment);
            const mine = attachment.uploadedBy.id === currentUserId;
            return (
              <li
                key={attachment.id}
                className="flex items-center gap-2 rounded-md border border-border bg-field px-3 py-2"
              >
                {image ? (
                  <button
                    type="button"
                    onClick={() => setPreview(attachment)}
                    className="size-8 shrink-0 overflow-hidden rounded border border-border/60"
                    aria-label={`Preview ${attachment.filename}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachment.url}
                      alt=""
                      className="size-full object-cover"
                    />
                  </button>
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded border border-border/60 bg-muted/40 text-muted-foreground">
                    <FileText className="size-4" strokeWidth={1.5} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-s text-foreground/90">
                    {attachment.filename}
                  </p>
                  {formatFileSize(attachment.fileSize) && (
                    <p className="text-xs text-muted-foreground/70">
                      {formatFileSize(attachment.fileSize)}
                    </p>
                  )}
                </div>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={attachment.filename}
                  aria-label={`Download ${attachment.filename}`}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Download className="size-3.5" />
                </a>
                {(mine || canManageOthers) && (
                  <button
                    type="button"
                    onClick={() => void remove(attachment)}
                    aria-label={`Remove ${attachment.filename}`}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[10001] grid place-items-center bg-black/80 p-6"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setPreview(null)}
            className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-black/50 text-white"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={preview.filename}
            onClick={(event) => event.stopPropagation()}
            className={cn("max-h-full max-w-full rounded-lg object-contain")}
          />
        </div>
      )}
    </section>
  );
}
