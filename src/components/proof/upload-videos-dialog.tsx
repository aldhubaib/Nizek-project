"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Film, Loader2, Plus, X } from "lucide-react";
import type { ProofVideoInput } from "@/actions/proof-of-work";
import { uploadFileToR2 } from "@/lib/upload";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { Button } from "@/components/ui/button";

type Row = { file: File; progress: number; failed: boolean };

/**
 * Pick video files, upload them, then hand the uploaded files to the caller.
 * Used wherever a video is recorded on someone else's behalf — an assigned
 * uploader answering a request, or the team attaching the sprint review.
 */
export function UploadVideosDialog({
  title,
  description,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  submitLabel: string;
  /** Resolve with an error message to keep the dialog open and show it. */
  onSubmit: (videos: ProofVideoInput[]) => Promise<string | null | void>;
  onClose: () => void;
}) {
  useScrollLock(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("video/"));
    if (next.length === 0) {
      setError("Choose video files only.");
      return;
    }
    setError(null);
    setRows((prev) => [...prev, ...next.map((file) => ({ file, progress: 0, failed: false }))]);
  }

  async function submit() {
    if (rows.length === 0) {
      setError("Choose at least one video.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const videos: ProofVideoInput[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const up = await uploadFileToR2(row.file, (pct) => {
            setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, progress: pct } : r)));
          });
          videos.push({
            filename: row.file.name,
            url: up.url,
            fileSize: up.fileSize ?? row.file.size,
            mimeType: up.mimeType ?? row.file.type,
          });
          setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, progress: 100 } : r)));
        } catch (err) {
          setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, failed: true } : r)));
          throw err;
        }
      }
      const problem = await onSubmit(videos);
      if (problem) {
        setError(problem);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div data-scroll-lock-root className="fixed inset-0 z-[900] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay" onClick={busy ? undefined : onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="relative mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange/15 text-orange">
            <Film className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </div>
            <p className="text-s leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mt-4 space-y-2">
          {rows.map((row, i) => (
            <div
              key={`${row.file.name}-${i}`}
              className="rounded-lg border border-border px-3 py-2 text-s"
            >
              <div className="flex items-center gap-2">
                <Film className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{row.file.name}</span>
                {busy ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {row.failed ? "Failed" : `${row.progress}%`}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Remove video"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {busy ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={row.failed ? "h-full bg-destructive" : "h-full bg-primary transition-[width]"}
                    style={{ width: `${row.failed ? 100 : row.progress}%` }}
                  />
                </div>
              ) : null}
            </div>
          ))}
          {!busy ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-s text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            >
              <Plus className="size-4" />
              Add videos
            </button>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-s text-destructive">{error}</p> : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-s font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <Button type="button" onClick={() => void submit()} disabled={busy || rows.length === 0}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Uploading…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
