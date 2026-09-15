"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";
import { getProjectMembersForMention } from "@/actions/comment";
import {
  createRecordComment,
  deleteRecordComment,
  listRecordComments,
} from "@/actions/record-comment";
import { usePasteFiles } from "@/hooks/use-paste-files";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { uploadFileToR2 } from "@/lib/upload";
import { cn } from "@/lib/utils";

type MentionUser = {
  id: string;
  name: string | null;
  imageUrl: string | null;
};

type Attachment = {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
};

type Comment = {
  id: string;
  content: string;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
  mentions: { user: { id: string; name: string | null } }[];
  attachments: Attachment[];
};

type PendingFile = {
  file: File;
  preview?: string;
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(mimeType: string | null): boolean {
  return !!mimeType && IMAGE_TYPES.includes(mimeType);
}

function timeAgo(date: Date): string {
  const d = new Date(date);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecordCommentSection({
  projectId,
  recordId,
}: {
  projectId: string;
  recordId: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState("");
  const [members, setMembers] = useState<MentionUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  useScrollLock(Boolean(lightboxUrl));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteRef = usePasteFiles(
    (files) => handleFilesSelected(files),
    { capture: true },
  );

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    listRecordComments({ projectId, entityType: "board", recordId })
      .then((result) => {
        if (!result.success) {
          setLoadError(result.error);
          return;
        }
        setComments(result.comments as unknown as Comment[]);
        setCurrentUserId(result.currentUserId);
      })
      .catch((err) => setLoadError(String(err?.message || err)))
      .finally(() => setLoading(false));
  }, [projectId, recordId]);

  useEffect(() => {
    getProjectMembersForMention(projectId)
      .then((data) => {
        setMembers(data.members);
        setCurrentUserId(data.currentUserId);
      })
      .catch(console.error);
  }, [projectId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const filteredMembers = members.filter((member) =>
    member.name?.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  const detectMention = useCallback((value: string, pos: number) => {
    const textBeforeCursor = value.slice(0, pos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionQuery("");
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const pos = e.target.selectionStart ?? 0;
    setInput(value);
    setCursorPos(pos);
    detectMention(value, pos);
  }

  function insertMention(user: MentionUser) {
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const mention = `@${user.name} `;
    const newValue = input.slice(0, atIndex) + mention + textAfterCursor;
    setInput(newValue);
    setShowMentions(false);
    setMentionQuery("");
    setTimeout(() => {
      const newPos = atIndex + mention.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showMentions || filteredMembers.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => Math.min(i + 1, filteredMembers.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredMembers[mentionIndex]);
    } else if (e.key === "Escape") {
      setShowMentions(false);
    }
  }

  function handleFilesSelected(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const pending: PendingFile = { file };
      if (isImageType(file.type)) pending.preview = URL.createObjectURL(file);
      next.push(pending);
    }
    setPendingFiles((prev) => [...prev, ...next]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    const trimmed = input.trim();
    if ((!trimmed && pendingFiles.length === 0) || submitting) return;
    const mentionedIds = members
      .filter((member) => member.name && trimmed.includes(`@${member.name}`))
      .map((member) => member.id);

    setSubmitting(true);
    setUploading(pendingFiles.length > 0);
    try {
      const attachments =
        pendingFiles.length > 0
          ? await Promise.all(
              pendingFiles.map(async ({ file }) => {
                const up = await uploadFileToR2(file);
                return {
                  filename: file.name,
                  url: up.url,
                  fileSize: file.size,
                  mimeType: file.type,
                };
              }),
            )
          : [];
      setUploading(false);
      const result = await createRecordComment({
        projectId,
        entityType: "board",
        recordId,
        content: trimmed,
        mentionedUserIds: mentionedIds.length > 0 ? mentionedIds : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      if (!result.success) {
        alert(`Failed to post comment: ${result.error}`);
        return;
      }
      setComments((prev) => [...prev, result.comment as unknown as Comment]);
      setInput("");
      pendingFiles.forEach((file) => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
      setPendingFiles([]);
    } catch (err) {
      alert(`Failed to post comment: ${(err as Error).message || err}`);
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteRecordComment(commentId);
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    } catch (err) {
      console.error(err);
    }
  }

  function renderContent(content: string) {
    const regex = /@[\w][\w\s]*?(?=\s@|$|\s(?![\w]))/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const matchText = match[0];
      const isMention = members.some((member) => member.name && matchText === `@${member.name}`);
      if (match.index > lastIndex) {
        result.push(
          <span key={`t-${lastIndex}`} className="text-foreground/80">
            {content.slice(lastIndex, match.index)}
          </span>,
        );
      }
      result.push(
        <span
          key={`m-${match.index}`}
          className={isMention ? "font-medium text-primary" : "text-foreground/80"}
        >
          {matchText}
        </span>,
      );
      lastIndex = match.index + matchText.length;
    }
    if (lastIndex < content.length) {
      result.push(
        <span key={`t-${lastIndex}`} className="text-foreground/80">
          {content.slice(lastIndex)}
        </span>,
      );
    }
    return result.length > 0 ? result : <span className="text-foreground/80">{content}</span>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <p className="py-4 text-center text-xs text-destructive">
          Failed to load comments: {loadError}
        </p>
      )}
      {!loadError && comments.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground/60">
          No comments yet. Be the first to comment.
        </p>
      )}

      <div className="max-h-[300px] space-y-3 overflow-y-auto">
        {comments.map((comment) => (
          <div key={comment.id} className="group flex gap-s">
            {comment.user.imageUrl ? (
              <img
                src={comment.user.imageUrl}
                alt=""
                className="mt-0.5 h-6 w-6 shrink-0 rounded-full"
              />
            ) : (
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <span className="text-xs font-bold text-muted-foreground">
                  {comment.user.name?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-s font-semibold text-foreground/90">
                  {comment.user.name ?? "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground/50">
                  {timeAgo(comment.createdAt)}
                </span>
                {currentUserId === comment.user.id && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(comment.id)}
                    className="rounded p-0.5 text-muted-foreground/40 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-s leading-relaxed text-foreground/80">
                {renderContent(comment.content)}
              </p>
              {comment.attachments?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-xs">
                  {comment.attachments.map((file) =>
                    isImageType(file.mimeType) ? (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => setLightboxUrl(file.url)}
                        className="relative overflow-hidden rounded-md border border-border transition-colors hover:border-primary/50"
                      >
                        <img
                          src={file.url}
                          alt={file.filename}
                          className="h-20 w-20 object-cover"
                        />
                      </button>
                    ) : (
                      <a
                        key={file.id}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-xs rounded-md border border-border bg-muted/30 px-2 py-1.5 hover:border-primary/50 hover:bg-muted/50"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="max-w-[120px] truncate text-xs text-foreground/70">
                          {file.filename}
                        </span>
                        {file.fileSize ? (
                          <span className="shrink-0 text-xs text-muted-foreground/50">
                            {formatFileSize(file.fileSize)}
                          </span>
                        ) : null}
                        <Download className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                      </a>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        {showMentions && filteredMembers.length > 0 && (
          <div
            ref={mentionListRef}
            className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-[150px] overflow-y-auto overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
          >
            {filteredMembers.map((member, i) => (
              <button
                key={member.id}
                type="button"
                onClick={() => insertMention(member)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-start text-s transition-colors",
                  i === mentionIndex
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {member.imageUrl ? (
                  <img src={member.imageUrl} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                    <span className="text-xs font-bold">
                      {member.name?.charAt(0)?.toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="font-medium">{member.name ?? "Unknown"}</span>
              </button>
            ))}
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-xs">
            {pendingFiles.map((file, i) => (
              <div key={i} className="group/pending relative">
                {file.preview ? (
                  <div className="h-14 w-14 overflow-hidden rounded-md border border-border">
                    <img src={file.preview} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="max-w-[80px] truncate text-xs text-foreground/70">
                      {file.file.name}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover/pending:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          ref={pasteRef}
          className="flex items-end gap-2 rounded-lg border border-border p-2 transition-colors focus-within:border-primary/50"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment… Use @ to mention"
            rows={1}
            className="min-h-6 max-h-40 w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-s leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={(!input.trim() && pendingFiles.length === 0) || submitting}
            className="shrink-0 rounded-md p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground/40">
          {uploading ? "Uploading files..." : "Paste a screenshot to attach"}
        </p>
      </div>

      {lightboxUrl && (
        <div data-scroll-lock-root className="fixed inset-0 z-[950]">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxUrl(null)}
          />
          <div
            className="absolute inset-4 z-[1] flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <div className="relative max-h-full max-w-full">
              <img
                src={lightboxUrl}
                alt=""
                className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="absolute -bottom-3 right-0 flex items-center gap-xs rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground/70 shadow-lg hover:bg-muted"
              >
                <Download className="h-3 w-3" />
                Open original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
