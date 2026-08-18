"use client";

import { useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Undo2, Loader2, AlertTriangle, ArrowRight, Paperclip, X, FileText, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Stage } from "@/store/kanban";
import { uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";

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
  /** Person who submitted the task — @mentioned by default and not editable. */
  mentionName?: string | null;
  mentionAvatar?: string | null;
  onConfirm: (comment: string, attachments?: DeclineAttachment[]) => Promise<void>;
  onCancel: () => void;
}

export function DeclineDialog({ fromStage, mentionName, mentionAvatar, onConfirm, onCancel }: Props) {
  const { user } = useUser();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteRef = usePasteFiles(
    (files) => handleFilesSelected(files),
    { capture: true },
  );

  const me = user?.fullName || user?.firstName || "You";
  const meAvatar = user?.imageUrl || null;
  const toLabel = STAGE_LABELS[DECLINE_TARGETS[fromStage]] ?? "the previous stage";

  function handleFilesSelected(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
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
            const up = await uploadFileToR2(file);
            return { filename: file.name, url: up.url, fileSize: file.size, mimeType: file.type };
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
      <div
        ref={pasteRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[901] w-full max-w-md"
      >
        <div className="rounded-xl border border-destructive/30 bg-card shadow-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/60 p-3 mb-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Decline a task
                </div>
                <div className="flex flex-wrap items-center gap-2 text-s">
                  <span className="inline-flex items-center gap-xs rounded-full bg-muted/60 py-0.5 ps-0.5 pe-2.5 text-muted-foreground">
                    <Avatar className="size-5">
                      {meAvatar && <AvatarImage src={meAvatar} alt={me} />}
                      <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                        {me.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    You
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  {mentionName ? (
                    <span className="inline-flex min-w-0 max-w-full items-center gap-xs rounded-full bg-primary/15 py-0.5 ps-0.5 pe-2.5 font-medium text-primary">
                      <Avatar className="size-5">
                        {mentionAvatar && <AvatarImage src={mentionAvatar} alt={mentionName} />}
                        <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                          {mentionName.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{mentionName}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-xs rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      Unassigned
                    </span>
                  )}
                </div>
                <p className="text-s leading-relaxed text-muted-foreground">
                  {mentionName ? `${mentionName} will be notified and this` : "This"} task will move back to {toLabel}.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-s font-medium text-foreground">
                Reason for declining <span className="text-destructive">*</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Explain what needs to be fixed or changed..."
                className="w-full rounded-lg border border-destructive/40 bg-background px-3 py-2.5 text-s text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive/50 resize-none transition-colors"
                rows={4}
                autoFocus
              />
              <p className="text-xs text-muted-foreground/60">
                A comment is required when declining a task
              </p>
            </div>

            {/* Pending files */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-xs mt-3">
                {pendingFiles.map((pf, i) => (
                  <div key={i} className="relative group/pending">
                    {pf.preview ? (
                      <div className="w-14 h-14 rounded-md overflow-hidden border border-border">
                        <img src={pf.preview} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-foreground/70 truncate max-w-[80px]">{pf.file.name}</span>
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

            {/* Dropzone */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFilesSelected(e.dataTransfer.files); }}
              className={`mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-center transition-colors ${
                dragOver
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border/70 bg-muted/20 hover:border-border hover:bg-muted/30"
              }`}
            >
              <Paperclip className="w-5 h-5 text-muted-foreground" />
              <span className="text-s text-muted-foreground">Attach files</span>
              <span className="text-xs text-muted-foreground/70">
                Drop, paste, or click to browse
              </span>
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
                <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />
              ) : (
                <Undo2 className="w-3.5 h-3.5 me-1.5" />
              )}
              Decline &amp; Return
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
