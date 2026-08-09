"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Package, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import { GrowingTextarea } from "@/components/equity/growing-textarea";
import { PhotoGallery } from "@/components/equity/photo-gallery";
import {
  Blank,
  EditButton,
  FormButtons,
  inputCls,
  textareaCls,
} from "@/components/equity/pitch-section";
import {
  saveEquityProduct,
  type EquityPortfolioDTO,
} from "@/actions/equity";

type Photo = EquityPortfolioDTO["productPhotos"][number];

type PhotoDraft = {
  /** Survives reordering and removal, which an index wouldn't. */
  key: string;
  url: string;
  caption: string;
};

let photoSeq = 0;

function toDraft(photo: Photo): PhotoDraft {
  photoSeq += 1;
  return {
    key: `photo-${photoSeq}`,
    url: photo.url,
    caption: photo.caption ?? "",
  };
}

/**
 * What has been built: the write-up, and the screenshots that show it.
 *
 * A product is the one part of a deck that is easier shown than described, so
 * the shots sit in the module beside the words rather than as an attachment
 * somewhere else.
 */
export function ProductSection({
  portfolioId,
  text,
  photos,
}: {
  portfolioId: string;
  text: string | null;
  photos: Photo[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const filled = Boolean(text) || photos.length > 0;
  const shots =
    photos.length > 0
      ? `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`
      : null;

  return (
    <CollapsibleCard
      icon={Package}
      title="The product"
      summary={
        [text ? "Written" : null, shots].filter(Boolean).join(" · ") ||
        "Nothing here yet"
      }
      description="What has actually been built, and what is next. Screenshots go here too — the report shows them as a gallery."
      forceOpen={editing}
      actions={
        !editing && <EditButton filled={filled} onClick={() => setEditing(true)} />
      }
    >
      {editing ? (
        <ProductForm
          portfolioId={portfolioId}
          text={text}
          photos={photos}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-4">
          {text ? (
            <p className="text-[13px] text-foreground whitespace-pre-wrap px-3 py-2 rounded-lg border border-border bg-muted/30">
              {text}
            </p>
          ) : (
            <Blank>Nothing written yet.</Blank>
          )}

          {photos.length > 0 && (
            <PhotoGallery
              photos={photos}
              className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              defaultColumns={4}
            />
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}

function ProductForm({
  portfolioId,
  text: storedText,
  photos: storedPhotos,
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  text: string | null;
  photos: Photo[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(storedText ?? "");
  const [photos, setPhotos] = useState<PhotoDraft[]>(() =>
    storedPhotos.map(toDraft),
  );
  // How many of the current batch are done, so a slow upload says so.
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Uploads run together and each lands as it finishes, so one large shot
   * doesn't hold up the rest. A file that fails is reported and skipped rather
   * than taking the batch with it.
   */
  async function addFiles(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    let done = 0;
    setUploading({ done, total: picked.length });
    const failed: string[] = [];

    await Promise.all(
      picked.map(async (file) => {
        try {
          const { url } = await uploadFileToR2(file);
          photoSeq += 1;
          setPhotos((ps) => [
            ...ps,
            { key: `photo-${photoSeq}`, url, caption: "" },
          ]);
        } catch {
          failed.push(file.name);
        } finally {
          done += 1;
          setUploading({ done, total: picked.length });
        }
      }),
    );

    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    if (failed.length > 0) {
      alert(`Couldn't upload ${failed.join(", ")}`);
    }
  }

  function move(key: string, by: number) {
    setPhotos((ps) => {
      const from = ps.findIndex((p) => p.key === key);
      const to = from + by;
      if (from < 0 || to < 0 || to >= ps.length) return ps;
      const next = [...ps];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      await saveEquityProduct(portfolioId, {
        text,
        photos: photos.map((p) => ({ url: p.url, caption: p.caption })),
      });
      onDone();
    } catch (err) {
      alert((err as Error).message || "Failed to save the product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <GrowingTextarea
        value={text}
        onChange={setText}
        placeholder="Search by price and location, browse host profiles, book in three clicks…"
        className={textareaCls}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Photos
          </span>
          <span className="text-[11px] text-muted-foreground">
            {uploading
              ? `Uploading ${uploading.done} of ${uploading.total}…`
              : `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
          </span>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((photo, i) => (
              <div key={photo.key} className="space-y-1.5">
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    className="w-full aspect-[4/3] object-cover rounded-lg border border-border bg-muted/30"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((ps) => ps.filter((p) => p.key !== photo.key))
                    }
                    aria-label="Remove this photo"
                    className="absolute top-1.5 right-1.5 w-6 h-6 grid place-items-center rounded-md bg-background/85 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {[
                      { by: -1, label: "Move left", glyph: "←", off: i === 0 },
                      {
                        by: 1,
                        label: "Move right",
                        glyph: "→",
                        off: i === photos.length - 1,
                      },
                    ].map((step) => (
                      <button
                        key={step.label}
                        type="button"
                        onClick={() => move(photo.key, step.by)}
                        disabled={step.off}
                        aria-label={step.label}
                        className={cn(
                          "w-6 h-6 grid place-items-center rounded-md bg-background/85 text-[11px] text-muted-foreground transition-colors",
                          step.off
                            ? "opacity-30"
                            : "hover:text-foreground hover:bg-background",
                        )}
                      >
                        {step.glyph}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={photo.caption}
                  onChange={(e) =>
                    setPhotos((ps) =>
                      ps.map((p) =>
                        p.key === photo.key
                          ? { ...p, caption: e.target.value }
                          : p,
                      ),
                    )
                  }
                  placeholder="Caption (optional)"
                  className={cn(inputCls, "h-8 text-[12px]")}
                />
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading != null}
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-dashed border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-40"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
          Add photos
        </button>
      </div>

      <FormButtons busy={busy || uploading != null} onCancel={onCancel} onSave={save} />
    </div>
  );
}
