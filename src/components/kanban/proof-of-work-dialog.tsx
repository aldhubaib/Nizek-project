"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Film, Loader2, Plus, X } from "lucide-react";
import { getProofBypassStatus, requestProofBypass, type ProofBypassStatus } from "@/actions/proof-of-work";
import { enqueueProofUpload } from "@/lib/proof-outbox";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { Button } from "@/components/ui/button";
import { useChannel } from "@/components/realtime/hooks";
import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { projectChannel } from "@/lib/channels";

export type ProofMoveTarget = {
  taskId: string;
  taskTitle: string;
  order: number;
};

export function ProofOfWorkDialog({
  target,
  projectId,
  onSubmitted,
  onCancel,
}: {
  target: ProofMoveTarget;
  projectId?: string;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  const cent = useCentrifugo();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [bypass, setBypass] = useState<ProofBypassStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getProofBypassStatus(target.taskId).then((status) => setBypass(status));
  }, [target.taskId]);

  useChannel(
    cent?.enabled && projectId ? projectChannel(projectId) : null,
    useCallback(
      (data: unknown) => {
        const ev = data as { type?: string; taskId?: string } | null;
        if (!ev?.type?.startsWith("proof-bypass.")) return;
        if (ev.taskId !== target.taskId) return;
        void getProofBypassStatus(target.taskId).then((status) => setBypass(status));
      },
      [target.taskId],
    ),
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("video/"));
    if (next.length === 0) {
      setError("Choose video files only.");
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...next]);
  }

  function submit(useBypass = false) {
    if (files.length === 0 && !useBypass) {
      setError("Upload at least one video, or ask for a bypass.");
      return;
    }
    enqueueProofUpload({
      taskId: target.taskId,
      taskTitle: target.taskTitle,
      order: target.order,
      files,
      useBypass,
    });
    onSubmitted();
  }

  async function askBypass() {
    setBusy(true);
    setError(null);
    try {
      setBypass(await requestProofBypass(target.taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ask for a bypass");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div data-scroll-lock-root className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay" onClick={onCancel} />
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange/15 text-orange">
            <Film className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Proof of work
            </div>
            <p className="text-s leading-relaxed text-muted-foreground">
              Upload videos showing the work before this task can enter Internal Review.
              You can keep using the app while they upload.
            </p>
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
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-s"
            >
              <Film className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Remove video"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-s text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          >
            <Plus className="size-4" />
            Add videos
          </button>
        </div>

        <div className="mt-4">
          {bypass?.status === "PENDING" ? (
            <p className="text-s text-muted-foreground">Bypass requested. Waiting for approval.</p>
          ) : bypass?.status === "APPROVED" ? (
            <p className="text-s text-success">
              Bypass approved{bypass.approvedByName ? ` by ${bypass.approvedByName}` : ""}.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void askBypass()}
              disabled={busy}
              className="text-s text-primary hover:underline disabled:opacity-50"
            >
              {busy ? "Asking…" : "Ask for Bypass"}
            </button>
          )}
        </div>

        {error ? <p className="mt-3 text-s text-destructive">{error}</p> : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-s font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          {bypass?.status === "APPROVED" && files.length === 0 ? (
            <Button type="button" onClick={() => submit(true)} disabled={busy}>
              Bypass
            </Button>
          ) : (
            <Button type="button" onClick={() => submit(false)} disabled={busy || files.length === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Upload & move
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
