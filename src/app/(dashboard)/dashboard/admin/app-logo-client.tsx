"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ImagePlus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  setBrandingAsset,
  removeBrandingAsset,
  type BrandingAssetDTO,
} from "@/actions/branding";
import {
  BRANDING_SLOTS,
  validateBrandingFile,
  MAX_BRANDING_FILE_BYTES,
  type BrandingSlotConfig,
  type BrandingSlotId,
} from "@/lib/branding-slots";

type Assets = Partial<Record<BrandingSlotId, BrandingAssetDTO>>;

export function AppLogoClient({ assets }: { assets: Assets }) {
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Upload branded assets for the browser tab, installed app icons, and
        social sharing. Each slot enforces the required format and dimensions
        before it&apos;s accepted.
      </p>
      <p className="text-[13px] text-muted-foreground rounded-lg border border-border bg-card/60 px-3 py-2.5 leading-relaxed">
        Sidebar, login, the browser tab, and the logo inside the installed app
        update within about a minute (or the next time someone focuses the app).
        iOS and Android home-screen icons are cached by the OS when the app is
        installed — users have to remove and re-add the app to get a new glyph.
        That cannot be forced from the website.
      </p>
      <div className="space-y-3">
        {BRANDING_SLOTS.map((slot) => (
          <SlotRow key={slot.id} slot={slot} asset={assets[slot.id]} />
        ))}
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function measureImage(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image dimensions"));
    img.src = src;
  });
}

function SlotRow({
  slot,
  asset,
}: {
  slot: BrandingSlotConfig;
  asset?: BrandingAssetDTO;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const onFile = async (files: FileList | null) => {
    setError(null);
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_BRANDING_FILE_BYTES) {
      setError(
        `File is too large. Maximum is ${MAX_BRANDING_FILE_BYTES / (1024 * 1024)} MB.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const src = await readFileAsDataUrl(file);
      const dims =
        file.type === "image/svg+xml"
          ? { width: 0, height: 0 }
          : await measureImage(src);
      const msg = validateBrandingFile(slot, file.type, file.name, dims);
      if (msg) {
        setError(msg);
        return;
      }
      const fd = new FormData();
      fd.set("slot", slot.id);
      fd.set("file", file);
      await setBrandingAsset(fd);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload file");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setError(null);
    setBusy(true);
    try {
      await removeBrandingAsset(slot.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-start gap-4">
        <SlotPreview slot={slot} asset={asset} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium">{slot.title}</div>
            {slot.optional && (
              <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Optional
              </span>
            )}
            {asset && !error && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </div>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <dt>Size</dt>
            <dd>{slot.sizesLabel}</dd>
            <dt>Format</dt>
            <dd>{slot.formatsLabel}</dd>
            {asset && (
              <>
                <dt>Current</dt>
                <dd className="truncate">
                  {asset.name}
                  {asset.width > 0 ? ` — ${asset.width}×${asset.height}` : ""}
                </dd>
              </>
            )}
          </dl>
          {slot.note && (
            <p className="mt-1 text-xs text-muted-foreground">{slot.note}</p>
          )}
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            aria-label={asset ? "Replace" : "Upload"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background text-foreground transition-colors hover:border-border disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
          </button>
          {asset && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              aria-label="Remove"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={slot.accept}
            className="hidden"
            onChange={(e) => onFile(e.target.files)}
          />
        </div>
      </div>
    </section>
  );
}

function SlotPreview({
  slot,
  asset,
}: {
  slot: BrandingSlotConfig;
  asset?: BrandingAssetDTO;
}) {
  const shape =
    slot.previewShape === "circle"
      ? "rounded-full"
      : slot.previewShape === "rounded"
        ? "rounded-xl"
        : slot.previewShape === "wide"
          ? "rounded-md"
          : "rounded-md";

  const base = `${slot.previewClass} ${shape} shrink-0 overflow-hidden border border-border/60 bg-background grid place-items-center`;

  if (!asset) {
    return (
      <div className={base}>
        <ImagePlus className="h-4 w-4 text-muted-foreground/60" />
      </div>
    );
  }

  return (
    <div className={base}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${asset.url}${asset.url.includes("?") ? "&" : "?"}v=${asset.updatedAt}`}
        alt=""
        className={
          slot.previewShape === "wide"
            ? "h-full w-full object-cover"
            : "h-full w-full object-contain"
        }
      />
    </div>
  );
}
