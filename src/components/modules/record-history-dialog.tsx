"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { History, Loader2, X } from "lucide-react";
import { listRecordHistory, type RecordHistoryBatch } from "@/actions/record-history";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { WorkflowEntityType } from "@/lib/workflow/types";

function timeLabel(iso: string) {
  const date = new Date(iso);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  const ago =
    diffMin < 1
      ? "just now"
      : diffMin < 60
        ? `${diffMin}m ago`
        : diffMin < 1440
          ? `${Math.floor(diffMin / 60)}h ago`
          : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const exact = date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { ago, exact };
}

function ChangeLine({
  label,
  oldValue,
  newValue,
}: {
  label: string;
  oldValue: string | null;
  newValue: string | null;
}) {
  if (!oldValue && newValue) {
    return (
      <p className="text-s">
        <span className="text-muted-foreground">{label}</span>
        {" · set to "}
        <span className="font-medium">{newValue}</span>
      </p>
    );
  }
  if (oldValue && !newValue) {
    return (
      <p className="text-s">
        <span className="text-muted-foreground">{label}</span>
        {" · cleared "}
        <span className="text-muted-foreground line-through">{oldValue}</span>
      </p>
    );
  }
  return (
    <p className="text-s">
      <span className="text-muted-foreground">{label}</span>
      {" · "}
      <span className="text-muted-foreground">{oldValue}</span>
      {" → "}
      <span className="font-medium">{newValue}</span>
    </p>
  );
}

export function RecordHistoryDialog({
  entityType,
  recordId,
  recordWord,
  onClose,
}: {
  entityType: WorkflowEntityType;
  recordId: string;
  recordWord: string;
  onClose: () => void;
}) {
  const [batches, setBatches] = useState<RecordHistoryBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    listRecordHistory(entityType, recordId)
      .then(setBatches)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entityType, recordId]);

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
          <History className="size-4 text-muted-foreground" />
          <h3 className="text-s font-semibold">History</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ms-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-s text-muted-foreground">
              No changes recorded yet.
            </p>
          ) : (
            <ul className="space-y-5">
              {batches.map((batch) => {
                const when = timeLabel(batch.createdAt);
                return (
                  <li key={batch.id} className="flex gap-3">
                    <Avatar size="xs" className="mt-0.5 ring-2 ring-card">
                      {batch.user.imageUrl && (
                        <AvatarImage src={batch.user.imageUrl} alt="" />
                      )}
                      <AvatarFallback>
                        {batch.user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <p className="text-s font-medium">{batch.user.name}</p>
                        <p
                          className="text-xs text-muted-foreground"
                          title={when.exact}
                        >
                          {when.ago}
                        </p>
                      </div>
                      {batch.kind === "created" ? (
                        <p className="mt-0.5 text-s text-muted-foreground">
                          Created this {recordWord}
                          {batch.changes[0]?.newValue
                            ? ` · ${batch.changes[0].newValue}`
                            : ""}
                        </p>
                      ) : (
                        <div className="mt-1.5 space-y-1">
                          {batch.changes.map((change) => (
                            <ChangeLine
                              key={`${batch.id}-${change.fieldKey}`}
                              label={change.fieldLabel}
                              oldValue={change.oldValue}
                              newValue={change.newValue}
                            />
                          ))}
                        </div>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {when.exact}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
