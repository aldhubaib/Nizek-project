"use client";

import { Film, Loader2, X } from "lucide-react";
import { dismissProofUpload, retryProofUpload, useProofOutbox } from "@/lib/proof-outbox";

export function ProofUploadToast() {
  const entries = useProofOutbox();
  const active = entries.slice(-3);
  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[300] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 lg:bottom-4">
      {active.map((entry) => {
        const pct =
          entry.files.length === 0
            ? 100
            : Math.round(entry.files.reduce((sum, f) => sum + f.progress, 0) / entry.files.length);
        return (
          <div
            key={entry.id}
            className="pointer-events-auto rounded-xl border border-border bg-card p-3 shadow-2xl"
          >
            <div className="flex items-start gap-2">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-orange/15 text-orange">
                {entry.status === "error" ? <X className="size-4" /> : <Film className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-s font-medium">{entry.taskTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.status === "uploading"
                    ? `Uploading videos… ${pct}%`
                    : entry.status === "submitting"
                      ? "Saving proof…"
                      : entry.status === "done"
                        ? "Moved to Internal Review"
                        : entry.errorMessage ?? "Upload failed"}
                </p>
                {(entry.status === "uploading" || entry.status === "submitting") && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-orange transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {entry.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => retryProofUpload(entry.id)}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
              {entry.status === "error" || entry.status === "done" ? (
                <button
                  type="button"
                  onClick={() => dismissProofUpload(entry.id)}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                  aria-label="Dismiss"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
