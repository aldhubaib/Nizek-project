"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GrowingTextarea } from "@/components/equity/growing-textarea";
import { uploadFileToR2 } from "@/lib/upload";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import {
  saveEquityTraction,
  type EquityPortfolioDTO,
} from "@/actions/equity";

type Milestone = EquityPortfolioDTO["milestones"][number];

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

const readCellCls =
  "min-h-9 px-3 py-2 rounded-lg border border-border bg-muted/30 flex items-center text-[13px] text-foreground";

const labelCls =
  "block text-[11px] font-medium text-muted-foreground uppercase tracking-wide";

/**
 * Date, title, the paragraph taking what's left, then the photo and the remove
 * button — both narrow, because most rows won't have a photo at all.
 */
const GRID = "sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,2fr)_4.5rem_1.75rem]";

type MilestoneDraft = {
  /** Survives reordering and edits, which an index wouldn't. */
  key: string;
  happenedOn: string;
  title: string;
  body: string;
  photoUrl: string;
};

let milestoneSeq = 0;

function blankMilestone(): MilestoneDraft {
  milestoneSeq += 1;
  return {
    key: `milestone-${milestoneSeq}`,
    happenedOn: "",
    title: "",
    body: "",
    photoUrl: "",
  };
}

function toDraft(milestone: Milestone): MilestoneDraft {
  return {
    ...blankMilestone(),
    happenedOn: milestone.happenedOn.slice(0, 10),
    title: milestone.title,
    body: milestone.body ?? "",
    photoUrl: milestone.photoUrl ?? "",
  };
}

function formatDay(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

/**
 * What has actually happened, dated: a launch, a first customer, a round
 * closed. The report reads these oldest first, so the day matters as much as
 * the wording — it's what turns a list of claims into a pace.
 *
 * Anything dated ahead of today reads as upcoming rather than achieved, which
 * is why there's no status to set here.
 */
export function TractionSection({
  portfolioId,
  milestones,
}: {
  portfolioId: string;
  milestones: Milestone[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = milestones.filter(
    (m) => m.happenedOn.slice(0, 10) > today,
  ).length;

  return (
    <CollapsibleCard
      icon={Flag}
      title="Traction"
      summary={
        milestones.length > 0
          ? `${milestones.length} ${
              milestones.length === 1 ? "milestone" : "milestones"
            }${upcoming > 0 ? ` · ${upcoming} upcoming` : ""}`
          : "Nothing here yet"
      }
      description="What has happened and when. Dates ahead of today show as upcoming in the report, so a plan can sit alongside the record without being mistaken for it."
      forceOpen={editing}
      actions={
        !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            {milestones.length > 0 ? "Edit" : "Fill in"}
          </button>
        )
      }
    >
      {editing ? (
        <TractionForm
          portfolioId={portfolioId}
          milestones={milestones}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : milestones.length === 0 ? (
        <p className="text-[13px] text-muted-foreground px-3 py-2 rounded-lg border border-dashed border-border">
          No milestones yet.
        </p>
      ) : (
        <div className="space-y-2">
          <div className={cn("hidden sm:grid gap-2 px-0.5", GRID)}>
            <span className={labelCls}>Date</span>
            <span className={labelCls}>Milestone</span>
            <span className={labelCls}>Detail</span>
            <span className={labelCls}>Photo</span>
            <span />
          </div>
          {milestones.map((milestone) => (
            <div
              key={milestone.id}
              className={cn("grid gap-2 items-stretch", GRID)}
            >
              <div className={cn(readCellCls, "tabular-nums")}>
                {formatDay(milestone.happenedOn)}
              </div>
              <div className={readCellCls}>{milestone.title}</div>
              <div className={readCellCls}>
                <span className="whitespace-pre-wrap break-words">
                  {milestone.body || "—"}
                </span>
              </div>
              {milestone.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={milestone.photoUrl}
                  alt=""
                  className="w-full h-9 object-cover rounded-lg border border-border bg-muted/30"
                />
              ) : (
                <div
                  className={cn(readCellCls, "justify-center text-muted-foreground")}
                >
                  —
                </div>
              )}
              <span />
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}


/**
 * One row's photo: the thumbnail once there is one, an empty frame to click
 * before that. Kept to the height of the inputs beside it so a row with a
 * photo is the same height as a row without.
 */
function PhotoCell({
  url,
  onChange,
  onBusy,
}: {
  url: string;
  onChange: (url: string) => void;
  onBusy: (uploading: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    onBusy(true);
    try {
      const { url: uploaded } = await uploadFileToR2(file);
      onChange(uploaded);
    } catch (err) {
      alert((err as Error).message || "Couldn't upload that photo");
    } finally {
      setBusy(false);
      onBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => upload(e.target.files?.[0])}
      />

      {url ? (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Replace this photo"
            className="block w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="w-full h-9 object-cover rounded-lg border border-border bg-muted/30"
            />
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            title="Remove this photo"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Add a photo"
          className="w-full h-9 grid place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

function TractionForm({
  portfolioId,
  milestones,
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  milestones: Milestone[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<MilestoneDraft[]>(() =>
    milestones.length > 0 ? milestones.map(toDraft) : [blankMilestone()],
  );
  const [error, setError] = useState<string | null>(null);
  // Uploads in flight across every row. Saving mid-upload would file the row
  // without its photo, so the button waits for them.
  const [uploads, setUploads] = useState(0);
  const setUploading = (on: boolean) => setUploads((n) => n + (on ? 1 : -1));

  function update(key: string, patch: Partial<MilestoneDraft>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // A milestone needs a day to be drawn against, so a titled row without one
  // is caught here rather than saved and left out of the chart.
  const undated = rows.filter((r) => r.title.trim() && !r.happenedOn);

  async function save() {
    if (undated.length > 0) {
      setError("Every milestone needs a date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveEquityTraction(
        portfolioId,
        rows.map((r) => ({
          happenedOn: r.happenedOn,
          title: r.title,
          body: r.body,
          photoUrl: r.photoUrl,
        })),
      );
      onDone();
    } catch (err) {
      setError((err as Error).message || "Failed to save the milestones");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className={cn("hidden sm:grid gap-2 px-0.5", GRID)}>
          <span className={labelCls}>Date</span>
          <span className={labelCls}>Milestone</span>
          <span className={labelCls}>Detail</span>
          <span className={labelCls}>Photo</span>
          <span />
        </div>

        {rows.map((row) => (
          <div key={row.key} className={cn("grid gap-2 items-start", GRID)}>
            <input
              type="date"
              value={row.happenedOn}
              onChange={(e) => update(row.key, { happenedOn: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              value={row.title}
              onChange={(e) => update(row.key, { title: e.target.value })}
              placeholder="First paying customer"
              className={inputCls}
            />
            <GrowingTextarea
              value={row.body}
              onChange={(body) => update(row.key, { body })}
              placeholder="What happened, and why it mattered."
              className={cn(inputCls, "py-2")}
            />
            <PhotoCell
              url={row.photoUrl}
              onChange={(photoUrl) => update(row.key, { photoUrl })}
              onBusy={setUploading}
            />
            <button
              type="button"
              onClick={() =>
                setRows((rs) =>
                  rs.length === 1
                    ? [blankMilestone()]
                    : rs.filter((r) => r.key !== row.key),
                )
              }
              title="Remove milestone"
              className="w-7 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blankMilestone()])}
          className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add a milestone
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        {error ? (
          <span className="text-[12px] text-destructive mr-auto">{error}</span>
        ) : (
          <span className="text-[12px] text-muted-foreground mr-auto">
            A photo is optional; where there is one it sits under the detail in
            the report.
          </span>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || uploads > 0}
          className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {busy ? "Saving…" : uploads > 0 ? "Uploading…" : "Save"}
        </button>
      </div>
    </div>
  );
}
