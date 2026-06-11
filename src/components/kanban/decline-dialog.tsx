"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Undo2, Loader2, AlertTriangle, Paperclip, X, FileText } from "lucide-react";
import type { Stage } from "@/store/kanban";

const STAGE_LABELS: Record<string, string> = {
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  IN_DEVELOPMENT: "In Development",
};

const DECLINE_TARGETS: Record<string, string> = {
  INTERNAL_REVIEW: "IN_DEVELOPMENT",
  CLIENT_REVIEW: "INTERNAL_REVIEW",
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface PendingFile {
  file: File;
  preview?: string;
}

export interface DeclineAttachment {
  filename: string;
  url: string;
  fileSize: number;
  mimeType: string;
}

interface Props {
  fromStage: Stage;
  onConfirm: (comment: string, attachments?: DeclineAttachment[]) => Promise<void>;
  onCancel: () => void;
}

export function DeclineDialog({ fromStage, onConfirm, onCancel }: Props) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const newFiles: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const pf: PendingFile = { file };
      if (IMAGE_TYPES.includes(file.type)) {
        pf.preview = URL.createObjectURL(file);
      }
      newFiles.push(pf);
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    try {
      let attachments: DeclineAttachment[] | undefined;
      if (pendingFiles.length > 0) {
        attachments = await Promise.all(
          pendingFiles.map(async ({ file }) => {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
            const { url } = await res.json();
            return { filename: file.name, url, fileSize: file.size, mimeType: file.type };
          })
        );
      }
      await onConfirm(comment.trim(), attachments);
      pendingFiles.forEach((pf) => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[900]"
        onClick={onCancel}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[901] w-full max-w-md">
        <div className="rounded-xl border border-destructive/30 bg-card shadow-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold">Decline Task</h3>
                <p className="text-[12px] text-muted-foreground">
                  Return this task from {STAGE_LABELS[fromStage] ?? fromStage} back to {STAGE_LABELS[DECLINE_TARGETS[fromStage]] ?? "previous stage"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-medium text-foreground">
                Reason for declining <span className="text-destructive">*</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Explain what needs to be fixed or changed..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive/50 resize-none transition-colors"
                rows={4}
                autoFocus
              />
              {comment.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60">
                  A comment is required when declining a task
                </p>
              )}
            </div>

            {/* Pending files */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {pendingFiles.map((pf, i) => (
                  <div key={i} className="relative group/pending">
                    {pf.preview ? (
                      <div className="w-14 h-14 rounded-md overflow-hidden border border-border">
                        <img src={pf.preview} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-foreground/70 truncate max-w-[80px]">{pf.file.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removePendingFile(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/pending:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Attach files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { handleFilesSelected(e.target.files); e.target.value = ""; }}
            />
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSubmit}
              disabled={!comment.trim() || submitting}
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Undo2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              Decline &amp; Return
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
