"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, ArrowLeftRight, Loader2 } from "lucide-react";
import { AddButton } from "@/components/add-button";
import {
  addLoginPhoto,
  removeLoginPhoto,
  setLoginPhotoColumn,
  type LoginPhotoDTO,
} from "@/actions/login-photos";

type Column = "a" | "b";

export function LoginSettingsClient({ photos }: { photos: LoginPhotoDTO[] }) {
  const colA = photos.filter((p) => p.column === "a");
  const colB = photos.filter((p) => p.column === "b");

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-s text-muted-foreground">
        Add photos to the two scrolling columns shown on the sign-in page. The
        left column scrolls up, the right column scrolls down.
      </p>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PhotoColumn label="Left column (scrolls up)" column="a" photos={colA} />
        <PhotoColumn
          label="Right column (scrolls down)"
          column="b"
          photos={colB}
        />
      </div>
    </div>
  );
}

function PhotoColumn({
  label,
  column,
  photos,
}: {
  label: string;
  column: Column;
  photos: LoginPhotoDTO[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPick = () => inputRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.set("file", file);
        fd.set("column", column);
        await addLoginPhoto(fd);
      }
      router.refresh();
    } catch {
      // best-effort; a failed upload just doesn't appear
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <AddButton
          label="Add photos"
          busy={uploading}
          disabled={uploading}
          onClick={onPick}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="grid w-full place-items-center rounded-xl border border-dashed border-border/60 bg-surface p-8 text-s text-muted-foreground transition-colors hover:border-border disabled:opacity-60"
        >
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <ImagePlus className="h-6 w-6" />
            )}
            <span>{uploading ? "Uploading…" : "Add photos"}</span>
          </div>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <PhotoTile key={p.id} photo={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function PhotoTile({ photo }: { photo: LoginPhotoDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const other: Column = photo.column === "a" ? "b" : "a";

  const move = async () => {
    setBusy(true);
    try {
      await setLoginPhotoColumn(photo.id, other);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeLoginPhoto(photo.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border/60 bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={move}
          disabled={busy}
          aria-label={`Move to column ${other.toUpperCase()}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-black hover:bg-white disabled:opacity-60"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          aria-label="Remove photo"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-black hover:bg-white disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
