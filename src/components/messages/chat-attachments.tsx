"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileAudio,
  FileVideo,
  File as FileIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/actions/messages";

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function fileIconFor(a: MessageAttachment) {
  const ct = a.contentType ?? "";
  if (ct.startsWith("video/")) return FileVideo;
  if (ct.startsWith("audio/")) return FileAudio;
  if (ct.includes("pdf")) return FileText;
  return FileIcon;
}

export function useLightbox() {
  const [state, setState] = useState<{
    images: MessageAttachment[];
    index: number;
  } | null>(null);
  return {
    open: (att: MessageAttachment, all: MessageAttachment[]) => {
      const idx = Math.max(
        0,
        all.findIndex((a) => a.id === att.id),
      );
      setState({ images: all, index: idx });
    },
    close: () => setState(null),
    state,
    setIndex: (i: number) => setState((s) => (s ? { ...s, index: i } : s)),
  };
}

export function Lightbox({
  images,
  index,
  onClose,
  onIndex,
  renderMenu,
}: {
  images: MessageAttachment[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  renderMenu?: (att: MessageAttachment) => React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft")
        onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, onClose, onIndex]);

  const current = images[index];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{current.name}</div>
          <div className="text-xs text-white/60">
            {index + 1} of {images.length}
            {current.sizeBytes ? ` · ${formatBytes(current.sizeBytes)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {renderMenu?.(current)}
          <a
            href={current.url}
            download={current.name}
            target="_blank"
            rel="noopener noreferrer"
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Download"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 && (
          <button
            type="button"
            onClick={() =>
              onIndex((index - 1 + images.length) % images.length)
            }
            className="absolute left-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.name}
          // Viewport-based cap (header ≈ 60px + bottom padding) instead of
          // max-h-full: percentage heights inside a grown flex item don't
          // resolve reliably (Safari/iOS), which let tall images overflow and
          // get cut off. dvh tracks the real visible height on mobile.
          className="max-h-[calc(100dvh-6.5rem)] max-w-full rounded-lg object-contain"
        />
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => onIndex((index + 1) % images.length)}
            className="absolute right-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

// Recorded voice notes (named by the recorder in the composer) get a compact
// player pill; other uploaded audio files keep the full file card below.
export function isVoiceAttachment(attachment: MessageAttachment): boolean {
  return (
    (attachment.contentType ?? "").startsWith("audio/") &&
    attachment.name.startsWith("Voice message")
  );
}

export function AttachmentBubble({
  attachment,
  mine,
  onOpenImage,
  menu,
  timeLabel,
}: {
  attachment: MessageAttachment;
  mine: boolean;
  onOpenImage?: (att: MessageAttachment) => void;
  menu?: React.ReactNode;
  /** Message time shown inline inside the voice pill (voice notes only). */
  timeLabel?: string;
}) {
  const ct = attachment.contentType ?? "";

  if (attachment.isImage) {
    return (
      <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-surface">
        <button
          type="button"
          onClick={() => onOpenImage?.(attachment)}
          className="block"
          aria-label={`Open ${attachment.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.name}
            loading="lazy"
            // Natural aspect ratio, capped — a portrait screenshot shows whole
            // rather than being cropped to fit a fixed landscape frame.
            className="block h-auto max-h-80 w-auto max-w-full object-contain transition-transform group-hover:scale-[1.02]"
          />
        </button>
        {menu && (
          <div className="absolute left-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 max-lg:opacity-100 group-hover:opacity-100">
            {menu}
          </div>
        )}
        <a
          href={attachment.url}
          download={attachment.name}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 max-lg:opacity-100 group-hover:opacity-100"
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    );
  }

  if (ct.startsWith("video/")) {
    return (
      <div className="group relative overflow-hidden rounded-xl bg-black">
        <video
          src={attachment.url}
          controls
          preload="metadata"
          className="max-h-96 w-full max-w-md"
        />
        <a
          href={attachment.url}
          download={attachment.name}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 max-lg:opacity-100 group-hover:opacity-100"
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    );
  }

  if (isVoiceAttachment(attachment)) {
    return (
      <div className="group flex w-full max-w-md items-center gap-2 rounded-xl border border-border/60 bg-surface/60 p-2">
        <audio
          src={attachment.url}
          controls
          preload="metadata"
          className="h-9 min-w-0 flex-1"
          style={{ colorScheme: "light" }}
        />
        {timeLabel && (
          <span className="shrink-0 pr-1 text-[10px] leading-none text-muted-foreground">
            {timeLabel}
          </span>
        )}
        {menu && <div className="shrink-0">{menu}</div>}
      </div>
    );
  }

  if (ct.startsWith("audio/")) {
    return (
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border/60 bg-surface/60 p-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <FileAudio className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{attachment.name}</div>
          <audio
            src={attachment.url}
            controls
            preload="metadata"
            className="mt-1 h-8 w-full"
            style={{ colorScheme: "dark" }}
          />
        </div>
        <a
          href={attachment.url}
          download={attachment.name}
          target="_blank"
          rel="noopener noreferrer"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    );
  }

  const Icon = fileIconFor(attachment);
  return (
    <div className="group relative w-full max-w-sm">
      <a
        href={attachment.url}
        download={attachment.name}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-2xl border border-border/60 bg-surface/60 p-3 text-foreground transition-colors hover:bg-surface"
      >
        <div className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Icon className="h-5 w-5 transition-opacity max-lg:opacity-0 group-hover:opacity-0" />
          <Download className="absolute h-5 w-5 opacity-0 transition-opacity max-lg:opacity-100 group-hover:opacity-100" />
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <div className="truncate text-sm font-semibold">{attachment.name}</div>
          <div className="text-xs text-muted-foreground">
            {(attachment.contentType ?? "").split("/")[1]?.toUpperCase() ?? "FILE"}
            {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
          </div>
        </div>
      </a>
      {menu && <div className="absolute right-1.5 top-1.5">{menu}</div>}
    </div>
  );
}

type Filter = "all" | "image" | "video" | "audio" | "file";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "file", label: "Files" },
];

export function FilesPanel({
  messages,
  onClose,
}: {
  messages: { authorName: string; createdAt: string; attachments: MessageAttachment[] }[];
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const lb = useLightbox();

  const items = useMemo(() => {
    const out: {
      att: MessageAttachment;
      authorName: string;
      createdAt: string;
    }[] = [];
    for (const m of messages) {
      for (const a of m.attachments) {
        const ct = a.contentType ?? "";
        const kind: Filter = a.isImage
          ? "image"
          : ct.startsWith("video/")
            ? "video"
            : ct.startsWith("audio/")
              ? "audio"
              : "file";
        if (filter === "all" || filter === kind) {
          out.push({ att: a, authorName: m.authorName, createdAt: m.createdAt });
        }
      }
    }
    return out.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [messages, filter]);

  const images = items.filter((i) => i.att.isImage).map((i) => i.att);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-l border-border/60">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <span className="text-sm font-semibold">Shared Files</span>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-4 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs transition-colors",
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted-foreground">
            No {filter === "all" ? "files" : filter + "s"} shared yet.
          </div>
        ) : filter === "image" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map(({ att }) => (
              <button
                key={att.id}
                onClick={() => lb.open(att, images)}
                className="group relative overflow-hidden rounded-lg bg-surface"
                style={{ aspectRatio: "1 / 1" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.url}
                  alt={att.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map(({ att, authorName, createdAt }) => {
              const Icon = att.isImage ? FileIcon : fileIconFor(att);
              return (
                <li key={att.id}>
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface/60">
                    {att.isImage ? (
                      <button
                        onClick={() => lb.open(att, images)}
                        className="size-10 shrink-0 overflow-hidden rounded-md bg-surface"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {att.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {authorName} ·{" "}
                        {new Date(createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                        {att.sizeBytes ? ` · ${formatBytes(att.sizeBytes)}` : ""}
                      </div>
                    </div>
                    <a
                      href={att.url}
                      download={att.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                      aria-label="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {lb.state && (
        <Lightbox
          images={lb.state.images}
          index={lb.state.index}
          onClose={lb.close}
          onIndex={lb.setIndex}
        />
      )}
    </div>
  );
}
