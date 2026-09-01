"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, X, Link, UserRound, Check, Download, Eye, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { usePasteFiles } from "@/hooks/use-paste-files";
import { useScrollLock } from "@/hooks/use-scroll-lock";

function Lightbox({
  images,
  currentIndex,
  onClose,
  onChange,
  onDownload,
}: {
  images: { name: string; dataUrl: string }[];
  currentIndex: number;
  onClose: () => void;
  onChange: (index: number) => void;
  onDownload: (entry: { name: string; dataUrl: string }) => void;
}) {
  const current = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onChange(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onChange(currentIndex + 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, hasPrev, hasNext, onClose, onChange]);

  useScrollLock(true);

  return (
    <div
      data-scroll-lock-root
      className="fixed inset-0 z-[900] flex flex-col bg-black/90"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-s text-white/70 truncate max-w-[50%]">
          {current.name}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-s text-white/40 tabular-nums">
            {currentIndex + 1} / {images.length}
          </span>
          <button
            onClick={() => onDownload(current)}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center relative px-16 min-h-0"
        onClick={onClose}
      >
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(currentIndex - 1); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <img
          src={current.dataUrl}
          alt={current.name}
          className="max-w-full max-h-full object-contain select-none"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />

        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(currentIndex + 1); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div
          className="flex items-center justify-center gap-2 px-5 py-3 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={img.name}
              onClick={() => onChange(i)}
              className={cn(
                "w-12 h-12 rounded-md overflow-hidden border-2 transition-all shrink-0",
                i === currentIndex ? "border-white opacity-100" : "border-transparent opacity-40 hover:opacity-70"
              )}
            >
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface TaskQuestion {
  id: string;
  question: string;
  type: string;
  options: string | null;
  multiple?: boolean;
  /** Non-null in the database, and every screen loads whole rows. */
  mandatory: boolean;
  required?: boolean;
  order: number;
}

function parseMultiValue(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v));
  } catch {
    /* not JSON — treat as a single legacy value */
  }
  return [raw];
}

/**
 * Whether the field label should show a required asterisk.
 *
 * The star tracks the Mandatory checkbox and nothing else, so it means the
 * same thing on every screen: the creation forms will not save without it and
 * the task page holds the task in Missing data until it is answered.
 */
export function questionShowsRequiredStar(question: { mandatory?: boolean }): boolean {
  return question.mandatory === true;
}

interface Props {
  question: TaskQuestion;
  index: number;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  readonly?: boolean;
  showLabel?: boolean;
}

function parseClientValue(raw: string): {
  needed: boolean | null;
  note: string;
  completed: boolean;
  /** ISO timestamp set when the answer was marked received. */
  completedAt: string | null;
} {
  if (!raw) return { needed: null, note: "", completed: false, completedAt: null };
  try {
    const parsed = JSON.parse(raw) as {
      needed?: boolean | null;
      note?: string;
      completed?: boolean;
      completedAt?: string | null;
    };
    return {
      needed: parsed.needed ?? null,
      note: parsed.note ?? "",
      completed: Boolean(parsed.completed),
      completedAt:
        typeof parsed.completedAt === "string" ? parsed.completedAt : null,
    };
  } catch {
    return { needed: null, note: "", completed: false, completedAt: null };
  }
}

function formatReceivedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function QuestionField({ question, index, value, onChange, compact, readonly: isReadonly, showLabel = true }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const clientTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parsedOptions: string[] = question.options
    ? JSON.parse(question.options)
    : [];

  const selectedValues = parseMultiValue(value);
  const toggleMultiValue = useCallback(
    (opt: string) => {
      const current = parseMultiValue(value);
      const next = current.includes(opt)
        ? current.filter((v) => v !== opt)
        : [...current, opt];
      onChange(next.length ? JSON.stringify(next) : "");
    },
    [value, onChange]
  );

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 56)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileEntries = value
    ? value.split("|||").filter(Boolean).map((entry) => {
        const sep = entry.indexOf("::");
        if (sep > -1) return { name: entry.slice(0, sep), dataUrl: entry.slice(sep + 2) };
        return { name: entry, dataUrl: "" };
      })
    : [];
  const fileEntriesRef = useRef(fileEntries);
  fileEntriesRef.current = fileEntries;

  const addFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;

    setUploading(true);
    setUploadError(null);

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
    const list = files;
    const tooBig = list.filter((f) => f.size > MAX_FILE_SIZE);
    const toUpload = list.filter((f) => f.size <= MAX_FILE_SIZE);

    setUploadProgress({ current: 0, total: toUpload.length });

    const uploaded: { name: string; dataUrl: string }[] = [];
    const failed: string[] = tooBig.map((f) => `${f.name} (too large)`);

    let done = 0;
    const results = await Promise.allSettled(
      toUpload.map(async (file) => {
        const up = await uploadFileToR2(file);
        done += 1;
        setUploadProgress({ current: done, total: toUpload.length });
        return { name: file.name, dataUrl: up.url };
      }),
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        uploaded.push(r.value);
      } else {
        failed.push(toUpload[idx].name);
        console.error(`Failed to upload ${toUpload[idx].name}:`, r.reason);
      }
    });

    if (uploaded.length > 0) {
      const combined = [...fileEntriesRef.current, ...uploaded];
      onChange(combined.map((f) => `${f.name}::${f.dataUrl}`).join("|||"));
    }

    if (failed.length > 0) {
      setUploadError(
        failed.length === 1
          ? `Failed to upload ${failed[0]}`
          : `Failed to upload ${failed.length} files: ${failed.join(", ")}`
      );
    }

    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [onChange]);

  const pasteRef = usePasteFiles(addFiles, {
    enabled: question.type === "file" && !isReadonly && !uploading,
    capture: true,
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    await addFiles(Array.from(files));
  }

  function removeFile(name: string) {
    onChange(fileEntries.filter((f) => f.name !== name).map((f) => `${f.name}::${f.dataUrl}`).join("|||"));
  }

  async function downloadFile(entry: { name: string; dataUrl: string }) {
    try {
      const res = await fetch(entry.dataUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(entry.dataUrl, "_blank");
    }
  }

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const isImageFile = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
  const imageEntries = fileEntries.filter((e) => e.dataUrl && isImageFile(e.name));

  function renderReadonly() {
    if (question.type === "client") {
      const cv = parseClientValue(value);
      if (cv.needed === null) return <span className="text-xs text-muted-foreground/60">Not answered</span>;
      return (
        <div className="space-y-1.5">
          <span className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            cv.needed === true
              ? "border-orange/30 bg-orange/10 text-orange"
              : "border-primary/30 bg-primary/10 text-primary"
          )}>
            {cv.needed ? "Yes" : "No"}
          </span>
          {cv.needed === true && cv.note && (
            <p className="text-s text-foreground/80 whitespace-pre-wrap">{cv.note}</p>
          )}
          {cv.needed === true && (
            <span className={cn("text-xs", cv.completed ? "text-success" : "text-muted-foreground/60")}>
              {cv.completed
                ? `Received from client${formatReceivedAt(cv.completedAt) ? ` · ${formatReceivedAt(cv.completedAt)}` : ""}`
                : "Waiting on client"}
            </span>
          )}
        </div>
      );
    }
    if (question.type === "file") {
      if (fileEntries.length === 0) return <p className="text-s text-muted-foreground/50">No files attached</p>;
      return (
        <div className="space-y-1.5">
          {fileEntries.map((entry, idx) => (
            <div key={`${entry.name}-${idx}`} className="flex items-center gap-2 rounded-md bg-muted/50 border border-border px-3 py-1.5 text-s">
              <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" strokeWidth={1.5} />
              <span className="flex-1 truncate text-foreground/80">{entry.name}</span>
              {isImageFile(entry.name) && (
                <button
                  onClick={() => {
                    if (!entry.dataUrl) return;
                    const idx = imageEntries.findIndex((e) => e.name === entry.name);
                    if (idx > -1) setPreviewIndex(idx);
                  }}
                  className={cn("p-1 rounded transition-colors", entry.dataUrl ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed")}
                  title="Preview"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => entry.dataUrl && downloadFile(entry)}
                className={cn("p-1 rounded transition-colors", entry.dataUrl ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed")}
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      );
    }
    if (question.type === "link") {
      if (!value) return <p className="text-s text-muted-foreground/50">—</p>;
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-s text-primary hover:underline break-all">
          {value}
        </a>
      );
    }
    if (question.type === "select" && question.multiple) {
      const values = parseMultiValue(value);
      if (values.length === 0) return <p className="text-s text-muted-foreground/50">—</p>;
      return (
        <div className="flex flex-wrap gap-xs">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-s text-foreground/80">
              {v}
            </span>
          ))}
        </div>
      );
    }
    if (!value) return <p className="text-s text-muted-foreground/50">—</p>;
    return <p className="text-s text-foreground/80 whitespace-pre-wrap">{value}</p>;
  }

  return (
    <div className={showLabel ? "space-y-2" : undefined}>
      {showLabel && (
        <label className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-s")}>
          {index + 1}. {question.question}
          {questionShowsRequiredStar(question) && (
            <span className="text-destructive ms-0.5">*</span>
          )}
        </label>
      )}

      {isReadonly ? renderReadonly() : question.type === "client" ? (() => {
        const cv = parseClientValue(value);
        const updateClient = (patch: Partial<typeof cv>) =>
          onChange(JSON.stringify({ ...cv, ...patch }));
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateClient({ needed: true })}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-s font-medium transition-colors",
                  cv.needed === true
                    ? "border-orange/40 bg-orange/10 text-orange"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40"
                )}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => updateClient({ needed: false, note: "", completed: false, completedAt: null })}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-s font-medium transition-colors",
                  cv.needed === false
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40"
                )}
              >
                No
              </button>
            </div>
            {cv.needed === true && (
              <>
                <Textarea
                  ref={clientTextareaRef}
                  value={cv.note}
                  onChange={(e) => updateClient({ note: e.target.value })}
                  placeholder="What do you need from the client?"
                  className="min-h-[56px] text-s resize-none leading-relaxed"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateClient(
                      cv.completed
                        ? { completed: false, completedAt: null }
                        : { completed: true, completedAt: new Date().toISOString() },
                    )
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-s font-medium transition-colors w-full",
                    cv.completed
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                    cv.completed ? "bg-success border-success" : "border-muted-foreground/40"
                  )}>
                    {cv.completed && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                  </div>
                  <span className="min-w-0 flex-1 text-start">
                    {cv.completed ? "Received from client" : "Waiting on client"}
                    {cv.completed && formatReceivedAt(cv.completedAt) && (
                      <span className="ms-1.5 font-normal opacity-80">
                        · {formatReceivedAt(cv.completedAt)}
                      </span>
                    )}
                  </span>
                </button>
              </>
            )}
          </div>
        );
      })(      ) : question.type === "file" ? (
        <div ref={pasteRef}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 w-full text-s text-muted-foreground transition-colors",
              uploading ? "opacity-60 cursor-not-allowed" : "hover:border-muted-foreground/40 hover:text-foreground"
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                Uploading {uploadProgress ? `${uploadProgress.current} of ${uploadProgress.total}` : "..."}
              </>
            ) : (
              <>
                <Paperclip className="w-4 h-4" strokeWidth={1.5} />
                {fileEntries.length > 0 ? "Attach more files" : "Click or paste to attach files"}
              </>
            )}
          </button>

          {uploadError && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-s text-destructive">{uploadError}</p>
              </div>
              <button type="button" onClick={() => setUploadError(null)} className="text-destructive/60 hover:text-destructive shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {fileEntries.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {fileEntries.map((entry, idx) => (
                <div
                  key={`${entry.name}-${idx}`}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border overflow-hidden"
                >
                  {isImageFile(entry.name) && entry.dataUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        const i = imageEntries.findIndex((e) => e.name === entry.name);
                        if (i > -1) setPreviewIndex(i);
                      }}
                      className="w-10 h-10 shrink-0 bg-muted overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.dataUrl} alt={entry.name} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-10 h-10 shrink-0 bg-muted flex items-center justify-center">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground/50" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 py-1.5">
                    <p className="text-s font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-success flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
                      Uploaded
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 pe-2 shrink-0">
                    {isImageFile(entry.name) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!entry.dataUrl) return;
                          const i = imageEntries.findIndex((e) => e.name === entry.name);
                          if (i > -1) setPreviewIndex(i);
                        }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => entry.dataUrl && downloadFile(entry)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFile(entry.name)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : question.type === "link" ? (
        <div className="relative">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
          <Input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
            className="h-9 text-s ps-9"
          />
        </div>
      ) : question.type === "select" && parsedOptions.length > 0 ? (
        question.multiple ? (
          <div className="flex flex-wrap gap-xs">
            {parsedOptions.map((opt) => {
              const selected = selectedValues.includes(opt);
              return (
                <button
                  type="button"
                  key={opt}
                  onClick={() => toggleMultiValue(opt)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-s transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                  )}
                >
                  {selected && <Check className="w-3 h-3" strokeWidth={2} />}
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <Select value={value} onValueChange={(val) => onChange(val ?? "")}>
            <SelectTrigger className="w-full h-9 text-s">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {parsedOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      ) : (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            autoResize();
          }}
          placeholder="Type your answer..."
          className="min-h-[56px] text-s resize-none overflow-hidden leading-relaxed"
        />
      )}

      {/* Lightbox */}
      {previewIndex !== null && imageEntries[previewIndex] && createPortal(
        <Lightbox
          images={imageEntries}
          currentIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onChange={setPreviewIndex}
          onDownload={downloadFile}
        />,
        document.body
      )}
    </div>
  );
}
