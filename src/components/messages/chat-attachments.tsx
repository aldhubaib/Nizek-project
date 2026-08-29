"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileAudio,
  FileVideo,
  File as FileIcon,
  Pause,
  Play,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/actions/messages";
import { extractUrls } from "@/lib/link-preview";

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatVoiceClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const VOICE_BARS = 40;

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable fake waveform so a sent note looks like speech, not a flat line. */
function seededPeaks(id: string): number[] {
  let s = hashSeed(id);
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const peaks: number[] = [];
  let envelope = 0.45;
  for (let i = 0; i < VOICE_BARS; i++) {
    envelope += (rand() - 0.48) * 0.28;
    envelope = Math.min(0.95, Math.max(0.18, envelope));
    const dip = rand() > 0.82 ? 0.12 + rand() * 0.2 : envelope;
    peaks.push(Math.min(1, dip * (0.4 + rand() * 0.6)));
  }
  return peaks;
}

/** Only one voice note plays at a time — starting another stops the last. */
let stopActiveVoice: (() => void) | null = null;

function finiteDuration(el: HTMLAudioElement): number {
  const d = el.duration;
  if (Number.isFinite(d) && d > 0) return d;
  if (el.seekable.length > 0) {
    const end = el.seekable.end(el.seekable.length - 1);
    if (Number.isFinite(end) && end > 0) return end;
  }
  return 0;
}

function VoiceWaveform({
  peaks,
  className,
}: {
  peaks: number[];
  className: string;
}) {
  return (
    <div className="flex h-10 w-full items-center gap-[2px]">
      {peaks.map((peak, i) => (
        <span
          key={i}
          className={cn("min-w-[2px] flex-1 rounded-full", className)}
          style={{ height: `${10 + Math.round(peak * 20)}px` }}
        />
      ))}
    </div>
  );
}

function VoiceNotePlayer({
  attachment,
  mine,
  timeLabel,
  menu,
}: {
  attachment: MessageAttachment;
  mine: boolean;
  timeLabel?: string;
  menu?: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const probingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const peaks = useMemo(
    () => seededPeaks(attachment.id || attachment.url),
    [attachment.id, attachment.url],
  );

  const captureDuration = useCallback((el: HTMLAudioElement) => {
    const d = finiteDuration(el);
    if (d > 0) setDuration(d);
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlaying(false);
    setCurrent(0);
  }, []);

  useEffect(() => {
    return () => {
      if (stopActiveVoice === stop) stopActiveVoice = null;
      audioRef.current?.pause();
    };
  }, [stop]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const el = audioRef.current;
      if (el && !probingRef.current) {
        setCurrent(el.currentTime);
        captureDuration(el);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, captureDuration]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    if (stopActiveVoice && stopActiveVoice !== stop) stopActiveVoice();
    stopActiveVoice = stop;
    el.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [playing, stop]);

  const seekTo = useCallback(
    (clientX: number, target: HTMLElement) => {
      const el = audioRef.current;
      if (!el) return;
      const d = duration || finiteDuration(el);
      if (d <= 0) return;
      const rect = target.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      el.currentTime = pct * d;
      setCurrent(el.currentTime);
      if (d !== duration) setDuration(d);
    },
    [duration],
  );

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const remainingClip = `${((1 - progress) * 100).toFixed(2)}%`;

  return (
    <div className="group relative flex max-w-full items-center gap-1.5">
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          const d = finiteDuration(el);
          if (d > 0) {
            setDuration(d);
            return;
          }
          // Chrome reports Infinity for some WebM notes until you seek past the end.
          probingRef.current = true;
          const prev = el.currentTime;
          el.currentTime = 1e101;
          const onUpdate = () => {
            el.removeEventListener("timeupdate", onUpdate);
            const found = finiteDuration(el);
            el.currentTime = prev;
            probingRef.current = false;
            if (found > 0) setDuration(found);
          };
          el.addEventListener("timeupdate", onUpdate);
        }}
        onDurationChange={(e) => captureDuration(e.currentTarget)}
        onEnded={stop}
        onPause={() => {
          if (!probingRef.current) setPlaying(false);
        }}
      />
      <div
        className={cn(
          "flex h-14 w-[min(100%,18.5rem)] items-center rounded-full ps-1.5 pe-3 shadow-md",
          mine
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={playing ? "Pause voice message" : "Play voice message"}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full transition-colors",
            mine ? "bg-black/20 hover:bg-black/30" : "bg-foreground/10 hover:bg-foreground/15",
          )}
        >
          {playing ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current ps-px" />
          )}
        </button>
        <button
          type="button"
          className="min-w-[7rem] flex-1 px-3"
          aria-label="Seek"
          onClick={(e) => {
            e.stopPropagation();
            seekTo(e.clientX, e.currentTarget);
          }}
        >
          <span className="relative block">
            <VoiceWaveform
              peaks={peaks}
              className={mine ? "bg-primary-foreground/30" : "bg-foreground/25"}
            />
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${remainingClip} 0 0)` }}
            >
              <VoiceWaveform
                peaks={peaks}
                className={mine ? "bg-white" : "bg-foreground"}
              />
            </span>
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 size-3 -translate-y-1/2 rounded-full shadow-sm",
                mine ? "bg-white" : "bg-foreground",
              )}
              style={{
                left: `calc(${progress * 100}% - 6px)`,
              }}
            />
          </span>
        </button>
        <span className="w-11 shrink-0 text-end font-mono text-xs font-medium tabular-nums">
          {formatVoiceClock(playing || current > 0 ? current : duration)}
        </span>
        {menu && (
          <div
            className={cn(
              "shrink-0 [&_button]:!grid [&_button]:size-8 [&_button]:opacity-100",
              mine ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {menu}
          </div>
        )}
      </div>
      {timeLabel && (
        <span className="shrink-0 text-xs leading-none text-muted-foreground">
          {timeLabel}
        </span>
      )}
    </div>
  );
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
  useScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft")
        onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [index, images.length, onClose, onIndex]);

  const current = images[index];
  if (!current) return null;

  return createPortal(
    <div
      data-scroll-lock-root
      className="fixed inset-0 z-[950] flex flex-col bg-black"
      style={{ zIndex: 950 }}
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
          <div className="truncate text-s font-medium">{current.name}</div>
          <div className="text-s text-white/60">
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
    </div>,
    document.body,
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

export function isVideoAttachment(attachment: MessageAttachment): boolean {
  return (attachment.contentType ?? "").startsWith("video/");
}

function VideoOverlay({
  attachment,
  onClose,
}: {
  attachment: MessageAttachment;
  onClose: () => void;
}) {
  useScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      data-scroll-lock-root
      className="fixed inset-0 z-[950] flex flex-col bg-black"
      style={{ zIndex: 950 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="truncate text-s font-medium">{attachment.name}</div>
          {attachment.sizeBytes ? (
            <div className="text-s text-white/60">{formatBytes(attachment.sizeBytes)}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <a
            href={attachment.url}
            download={attachment.name}
            target="_blank"
            rel="noopener noreferrer"
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Download"
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
        <video
          src={attachment.url}
          controls
          autoPlay
          playsInline
          className="max-h-[calc(100dvh-6.5rem)] max-w-full rounded-lg"
        />
      </div>
    </div>,
    document.body,
  );
}

function CompactVideoTile({
  attachment,
  embedded,
  menu,
}: {
  attachment: MessageAttachment;
  embedded?: boolean;
  menu?: React.ReactNode;
}) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden border border-border/50 bg-surface",
          embedded ? "rounded-lg" : "rounded-xl",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPlaying(true);
          }}
          className="block w-full text-left"
          aria-label={`Play ${attachment.name}`}
        >
          <div className="relative aspect-video bg-black">
            <video
              src={attachment.url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                if (Number.isFinite(el.duration)) setDuration(el.duration);
                if (el.currentTime === 0) el.currentTime = 0.1;
              }}
            />
            <span className="absolute inset-0 grid place-items-center bg-black/25">
              <span className="grid size-9 place-items-center rounded-full bg-white/90 text-black shadow-sm">
                <Play className="size-3.5 fill-current ps-px" />
              </span>
            </span>
            {duration != null && duration > 0 && (
              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                <FileVideo className="size-3" />
                {formatDuration(duration)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 bg-surface-2/80 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {attachment.name}
            </span>
            {attachment.sizeBytes ? (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {formatBytes(attachment.sizeBytes)}
              </span>
            ) : null}
          </div>
        </button>
        {menu && (
          <div className="absolute left-1.5 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 max-lg:opacity-100 group-hover:opacity-100">
            {menu}
          </div>
        )}
      </div>
      {playing ? (
        <VideoOverlay attachment={attachment} onClose={() => setPlaying(false)} />
      ) : null}
    </>
  );
}

export function AttachmentBubble({
  attachment,
  mine,
  onOpenImage,
  menu,
  timeLabel,
  embedded,
}: {
  attachment: MessageAttachment;
  mine: boolean;
  onOpenImage?: (att: MessageAttachment) => void;
  menu?: React.ReactNode;
  /** Message time shown inline inside the voice pill (voice notes only). */
  timeLabel?: string;
  /** Nested inside a text bubble — no extra chrome, fills the bubble width. */
  embedded?: boolean;
}) {
  const ct = attachment.contentType ?? "";

  if (attachment.isImage) {
    return (
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl",
          !embedded && "border border-border/50 bg-surface",
        )}
      >
        <button
          type="button"
          onClick={() => onOpenImage?.(attachment)}
          className="relative block min-h-40 w-full max-h-80 overflow-hidden bg-surface"
          aria-label={`Open ${attachment.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.name}
            loading="lazy"
            className="block h-auto max-h-80 w-full object-contain"
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
          className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-overlay text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 max-lg:opacity-100 group-hover:opacity-100"
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    );
  }

  if (ct.startsWith("video/")) {
    return (
      <CompactVideoTile
        attachment={attachment}
        embedded={embedded}
        menu={menu}
      />
    );
  }

  if (isVoiceAttachment(attachment)) {
    return (
      <VoiceNotePlayer
        attachment={attachment}
        mine={mine}
        timeLabel={timeLabel}
        menu={menu}
      />
    );
  }

  if (ct.startsWith("audio/")) {
    return (
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border/60 bg-surface/60 p-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <FileAudio className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-s font-medium">{attachment.name}</div>
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
        <div className="min-w-0 flex-1 pe-6">
          <div className="truncate text-s font-semibold">{attachment.name}</div>
          <div className="text-s text-muted-foreground">
            {(attachment.contentType ?? "").split("/")[1]?.toUpperCase() ?? "FILE"}
            {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
          </div>
        </div>
      </a>
      {menu && <div className="absolute right-1.5 top-1.5">{menu}</div>}
    </div>
  );
}

type Tab = "media" | "docs" | "links" | "audio";

const TABS: { id: Tab; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "docs", label: "Docs" },
  { id: "links", label: "Links" },
  { id: "audio", label: "Audio" },
];

type PanelMessage = {
  authorName: string;
  createdAt: string;
  body?: string;
  attachments: MessageAttachment[];
};

type FileRow = {
  att: MessageAttachment;
  authorName: string;
  createdAt: string;
  kind: Exclude<Tab, "links">;
};

function attachmentKind(a: MessageAttachment): FileRow["kind"] {
  const ct = a.contentType ?? "";
  if (a.isImage) return "media";
  if (ct.startsWith("video/")) return "media";
  if (ct.startsWith("audio/")) return "audio";
  return "docs";
}

function groupByMonth<T extends { createdAt: string }>(rows: T[]) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  const now = new Date();
  for (const row of rows) {
    const d = new Date(row.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push(row);
      continue;
    }
    const label =
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        ? "This month"
        : d.toLocaleDateString([], { month: "long", year: "numeric" });
    groups.push({ key, label, items: [row] });
  }
  return groups;
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function FilesPanel({
  messages,
}: {
  messages: PanelMessage[];
}) {
  const [tab, setTab] = useState<Tab>("media");
  const [playingVideo, setPlayingVideo] = useState<MessageAttachment | null>(null);
  const lb = useLightbox();

  const files = useMemo(() => {
    const out: FileRow[] = [];
    for (const m of messages) {
      for (const a of m.attachments) {
        out.push({
          att: a,
          authorName: m.authorName,
          createdAt: m.createdAt,
          kind: attachmentKind(a),
        });
      }
    }
    return out.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [messages]);

  const media = useMemo(() => files.filter((i) => i.kind === "media"), [files]);
  const docs = useMemo(() => files.filter((i) => i.kind === "docs"), [files]);
  const audio = useMemo(() => files.filter((i) => i.kind === "audio"), [files]);
  const images = useMemo(
    () => media.filter((i) => i.att.isImage).map((i) => i.att),
    [media],
  );

  const links = useMemo(() => {
    const out: { url: string; authorName: string; createdAt: string }[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      for (const url of extractUrls(m.body ?? "")) {
        const key = `${url}|${m.createdAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ url, authorName: m.authorName, createdAt: m.createdAt });
      }
    }
    return out.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [messages]);

  const emptyLabel =
    tab === "media"
      ? "No media"
      : tab === "docs"
        ? "No documents"
        : tab === "links"
          ? "No links"
          : "No audio";

  const isEmpty =
    tab === "media"
      ? media.length === 0
      : tab === "docs"
        ? docs.length === 0
        : tab === "links"
          ? links.length === 0
          : audio.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 border-b border-border/60">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 border-b-2 py-2.5 text-s font-medium transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isEmpty ? (
          <div className="px-6 py-16 text-center text-s text-muted-foreground">
            {emptyLabel} shared yet.
          </div>
        ) : tab === "media" ? (
          <div className="flex flex-col">
            {groupByMonth(media).map((g) => (
              <section key={g.key}>
                <h3 className="px-3 py-2 text-s font-medium text-muted-foreground">
                  {g.label}
                </h3>
                <div className="grid grid-cols-3 gap-0.5">
                  {g.items.map(({ att }) => {
                    const video = isVideoAttachment(att);
                    return (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() =>
                          video
                            ? setPlayingVideo(att)
                            : lb.open(att, images)
                        }
                        className="relative aspect-square overflow-hidden bg-surface"
                      >
                        {video ? (
                          <>
                            <video
                              src={att.url}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <span className="absolute inset-0 grid place-items-center bg-black/25">
                              <Play className="h-7 w-7 fill-white text-white" />
                            </span>
                          </>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={att.url}
                            alt={att.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : tab === "links" ? (
          <ul className="flex flex-col">
            {groupByMonth(links).map((g) => (
              <li key={g.key}>
                <h3 className="px-4 py-2 text-s font-medium text-muted-foreground">
                  {g.label}
                </h3>
                <ul>
                  {g.items.map((item) => (
                    <li key={`${item.url}-${item.createdAt}`}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface/60"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                          <Link2 className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-s font-medium">
                            {hostnameOf(item.url)}
                          </span>
                          <span className="block truncate text-s text-muted-foreground">
                            {item.authorName} ·{" "}
                            {new Date(item.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <FileList
            rows={tab === "docs" ? docs : audio}
            onOpenImage={(att) => lb.open(att, images)}
            onOpenVideo={setPlayingVideo}
          />
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
      {playingVideo ? (
        <VideoOverlay
          attachment={playingVideo}
          onClose={() => setPlayingVideo(null)}
        />
      ) : null}
    </div>
  );
}

function FileList({
  rows,
  onOpenImage,
  onOpenVideo,
}: {
  rows: FileRow[];
  onOpenImage: (att: MessageAttachment) => void;
  onOpenVideo: (att: MessageAttachment) => void;
}) {
  return (
    <ul className="flex flex-col">
      {groupByMonth(rows).map((g) => (
        <li key={g.key}>
          <h3 className="px-4 py-2 text-s font-medium text-muted-foreground">
            {g.label}
          </h3>
          <ul>
            {g.items.map(({ att, authorName, createdAt }) => {
              const Icon = att.isImage ? FileIcon : fileIconFor(att);
              const isVideo = isVideoAttachment(att);
              const openMedia = att.isImage
                ? () => onOpenImage(att)
                : isVideo
                  ? () => onOpenVideo(att)
                  : null;
              return (
                <li key={att.id}>
                  <div className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface/60">
                    {att.isImage ? (
                      <button
                        type="button"
                        onClick={openMedia ?? undefined}
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
                      <button
                        type="button"
                        onClick={openMedia ?? undefined}
                        disabled={!openMedia}
                        className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary disabled:cursor-default"
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openMedia ?? undefined}
                      disabled={!openMedia}
                      className="min-w-0 flex-1 text-start disabled:cursor-default"
                    >
                      <div className="truncate text-s font-medium">
                        {att.name}
                      </div>
                      <div className="truncate text-s text-muted-foreground">
                        {authorName} ·{" "}
                        {new Date(createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                        {att.sizeBytes ? ` · ${formatBytes(att.sizeBytes)}` : ""}
                      </div>
                    </button>
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
        </li>
      ))}
    </ul>
  );
}
