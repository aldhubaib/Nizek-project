"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Loader2, Play, Volume2 } from "lucide-react";
import {
  setNotificationSound,
  removeNotificationSound,
  type NotificationSoundDTO,
} from "@/actions/notification-sound-settings";

const MAX_BYTES = 3 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NotificationSoundClient({ sound }: { sound: NotificationSoundDTO }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = () => inputRef.current?.click();

  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("audio/")) {
      setError("Please choose an audio file (MP3, WAV, OGG, or M4A).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Audio is too large. Keep it under 3 MB.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      await setNotificationSound(fd);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeNotificationSound();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the sound.");
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    audioRef.current?.play().catch(() => {});
  };

  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-sm text-muted-foreground">
        Upload a custom sound that plays for everyone when they receive a
        notification while the app is open. If none is set, a default chime is
        used. Keep it short (a second or two) and under 3&nbsp;MB. Supported:
        MP3, WAV, OGG, M4A.
      </p>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {sound ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/40 text-foreground">
            <Volume2 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{sound.name}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatSize(sound.size)} · current notification sound
            </div>
          </div>
          <audio ref={audioRef} src={sound.url} preload="auto" />
          <button
            type="button"
            onClick={preview}
            disabled={busy}
            aria-label="Play sound"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-surface text-foreground transition-colors hover:border-border disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            aria-label="Replace sound"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-surface text-foreground transition-colors hover:border-border disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label="Remove sound"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-surface text-destructive transition-colors hover:border-destructive/50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="grid w-full place-items-center rounded-xl border border-dashed border-border/60 bg-surface p-8 text-sm text-muted-foreground transition-colors hover:border-border disabled:opacity-60"
        >
          <div className="flex flex-col items-center gap-2">
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Upload className="h-6 w-6" />
            )}
            <span>{busy ? "Uploading…" : "Upload notification sound"}</span>
          </div>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files)}
      />
    </div>
  );
}
