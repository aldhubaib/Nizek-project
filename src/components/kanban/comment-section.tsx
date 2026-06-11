"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createComment, getComments, deleteComment, getProjectMembersForMention } from "@/actions/comment";
import { Loader2, Send, Trash2, Paperclip, X, FileText, Download, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MentionUser {
  id: string;
  name: string | null;
  imageUrl: string | null;
}

interface Attachment {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
  mentions: { user: { id: string; name: string | null } }[];
  attachments: Attachment[];
}

interface PendingFile {
  file: File;
  preview?: string;
}

interface Props {
  taskId: string;
  projectId: string;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(mimeType: string | null): boolean {
  return !!mimeType && IMAGE_TYPES.includes(mimeType);
}

export function CommentSection({ taskId, projectId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState("");
  const [members, setMembers] = useState<MentionUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getComments(taskId)
      .then((data) => setComments(data as Comment[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    getProjectMembersForMention(projectId)
      .then((data) => {
        setMembers(data.members);
        setCurrentUserId(data.currentUserId);
      })
      .catch(console.error);
  }, [projectId]);

  const filteredMembers = members.filter((m) =>
    m.name?.toLowerCase().includes(mentionQuery.toLowerCase())
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
    const before = input.slice(0, atIndex);
    const mention = `@${user.name} `;
    const newValue = before + mention + textAfterCursor;
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
    if (showMentions && filteredMembers.length > 0) {
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
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const newFiles: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const pf: PendingFile = { file };
      if (isImageType(file.type)) {
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

  async function uploadFiles(files: PendingFile[]): Promise<{ filename: string; url: string; fileSize: number; mimeType: string }[]> {
    const results = await Promise.all(
      files.map(async ({ file }) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const { url } = await res.json();
        return { filename: file.name, url, fileSize: file.size, mimeType: file.type };
      })
    );
    return results;
  }

  async function handleSubmit() {
    const trimmed = input.trim();
    if ((!trimmed && pendingFiles.length === 0) || submitting) return;

    const mentionedIds = members
      .filter((m) => m.name && trimmed.includes(`@${m.name}`))
      .map((m) => m.id);

    setSubmitting(true);
    setUploading(pendingFiles.length > 0);
    try {
      let attachments: { filename: string; url: string; fileSize: number; mimeType: string }[] = [];
      if (pendingFiles.length > 0) {
        attachments = await uploadFiles(pendingFiles);
      }
      setUploading(false);

      const comment = await createComment({
        taskId,
        content: trimmed || (attachments.length > 0 ? `📎 ${attachments.length} file${attachments.length > 1 ? "s" : ""} attached` : ""),
        mentionedUserIds: mentionedIds.length > 0 ? mentionedIds : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setComments((prev) => [...prev, comment as Comment]);
      setInput("");
      pendingFiles.forEach((pf) => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
      setPendingFiles([]);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
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
      const isMention = members.some((m) => m.name && matchText === `@${m.name}`);

      if (match.index > lastIndex) {
        result.push(
          <span key={`t-${lastIndex}`} className="text-foreground/80">
            {content.slice(lastIndex, match.index)}
          </span>
        );
      }

      result.push(
        <span key={`m-${match.index}`} className={isMention ? "text-blue-400 font-medium" : "text-foreground/80"}>
          {matchText}
        </span>
      );
      lastIndex = match.index + matchText.length;
    }

    if (lastIndex < content.length) {
      result.push(
        <span key={`t-${lastIndex}`} className="text-foreground/80">
          {content.slice(lastIndex)}
        </span>
      );
    }

    return result.length > 0 ? result : <span className="text-foreground/80">{content}</span>;
  }

  function timeAgo(date: Date): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center py-4">
          No comments yet. Be the first to comment.
        </p>
      )}

      <div className="space-y-3 max-h-[300px] overflow-y-auto">
        {comments.map((c) => (
          <div key={c.id} className="group flex gap-2.5">
            {c.user.imageUrl ? (
              <img
                src={c.user.imageUrl}
                alt=""
                className="w-6 h-6 rounded-full shrink-0 mt-0.5"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-muted shrink-0 mt-0.5 flex items-center justify-center">
                <span className="text-[9px] font-bold text-muted-foreground">
                  {c.user.name?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-foreground/90">
                  {c.user.name ?? "Unknown"}
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                  {timeAgo(c.createdAt)}
                </span>
                {currentUserId === c.user.id && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground/40 hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-[12px] text-foreground/80 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                {renderContent(c.content)}
              </p>

              {c.attachments && c.attachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.attachments.map((a) =>
                    isImageType(a.mimeType) ? (
                      <button
                        key={a.id}
                        onClick={() => setLightboxUrl(a.url)}
                        className="relative group/thumb rounded-md overflow-hidden border border-border hover:border-primary/50 transition-colors"
                      >
                        <img
                          src={a.url}
                          alt={a.filename}
                          className="w-20 h-20 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/30 transition-colors flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ) : (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 hover:border-primary/50 hover:bg-muted/50 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-foreground/70 truncate max-w-[120px]">
                          {a.filename}
                        </span>
                        {a.fileSize && (
                          <span className="text-[9px] text-muted-foreground/50 shrink-0">
                            {formatFileSize(a.fileSize)}
                          </span>
                        )}
                        <Download className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                      </a>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="relative">
        {showMentions && filteredMembers.length > 0 && (
          <div
            ref={mentionListRef}
            className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-10 max-h-[150px] overflow-y-auto"
          >
            {filteredMembers.map((m, i) => (
              <button
                key={m.id}
                onClick={() => insertMention(m)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-left text-[12px] transition-colors",
                  i === mentionIndex ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                {m.imageUrl ? (
                  <img src={m.imageUrl} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-[8px] font-bold">{m.name?.charAt(0)?.toUpperCase()}</span>
                  </div>
                )}
                <span className="font-medium">{m.name ?? "Unknown"}</span>
              </button>
            ))}
          </div>
        )}

        {/* Pending files preview */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
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

        <div className="flex items-end gap-2 border border-border rounded-lg p-2 focus-within:border-primary/50 transition-colors">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            title="Attach files"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { handleFilesSelected(e.target.files); e.target.value = ""; }}
          />
          <div className="flex-1 relative min-h-[24px] max-h-[100px]">
            <div
              aria-hidden
              className="absolute inset-0 text-[12px] leading-[1.5] whitespace-pre-wrap break-words pointer-events-none text-transparent overflow-hidden"
            >
              {renderContent(input)}{"\u200B"}
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Write a comment... Use @ to mention"
              rows={1}
              className="relative w-full resize-none bg-transparent text-[12px] leading-[1.5] text-foreground placeholder:text-muted-foreground/50 outline-none min-h-[24px] max-h-[100px] caret-foreground"
              style={{ fieldSizing: "content", WebkitTextFillColor: "transparent" } as React.CSSProperties}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={(!input.trim() && pendingFiles.length === 0) || submitting}
            className="p-1.5 rounded-md text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-1">
          {uploading ? "Uploading files..." : "Press Enter to send, Shift+Enter for new line"}
        </p>
      </div>

      {/* Image lightbox */}
      {lightboxUrl && (
        <>
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[950]"
            onClick={() => setLightboxUrl(null)}
          />
          <div
            className="fixed inset-4 z-[951] flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <div className="relative max-w-full max-h-full">
              <img
                src={lightboxUrl}
                alt=""
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => setLightboxUrl(null)}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="absolute -bottom-3 right-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-[11px] text-foreground/70 hover:bg-muted transition-colors shadow-lg"
              >
                <Download className="w-3 h-3" />
                Open original
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
