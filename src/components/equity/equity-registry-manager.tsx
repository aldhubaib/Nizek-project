"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { HolderAvatar } from "@/components/equity/holder-avatar";
import {
  addEquityHolder,
  updateEquityHolder,
  deleteEquityHolder,
  addEquityRole,
  updateEquityRole,
  deleteEquityRole,
  type EquityHolderDTO,
  type EquityRoleDTO,
} from "@/actions/equity";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40";

const labelCls =
  "block text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wide";

type ListItem = {
  id: string;
  name: string;
  /** Small marker after the name — currently only used to point out ourselves. */
  marker?: string;
  /** Where the entry is referenced, which is also why it may not be deletable. */
  usage: string;
  /** The row that is us: renameable, never removable. */
  undeletable?: boolean;
};

/**
 * A dynamic list of names the equity forms pick from. Renaming follows the entry
 * everywhere it already appears, which is the point of holding these centrally
 * rather than typing them per grant; deleting is refused by the server while
 * anything still references it, so history can't be rewritten from here.
 */
function RegistryList({
  title,
  icon,
  description,
  placeholder,
  emptyLabel,
  items,
  onAdd,
  onRename,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  placeholder: string;
  emptyLabel: string;
  items: ListItem[];
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (item: ListItem) => Promise<void>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      alert((err as Error).message || failure);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!draft.trim()) return;
    await run(async () => {
      await onAdd(draft.trim());
      setDraft("");
    }, "Failed to add");
  }

  async function rename(id: string) {
    if (!editValue.trim()) return;
    await run(async () => {
      await onRename(id, editValue.trim());
      setEditingId(null);
    }, "Failed to rename");
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        <span className="text-[11px] text-muted-foreground/60 tabular-nums">
          {items.length}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{description}</p>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className={cn(inputCls, "flex-1 min-w-0")}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !draft.trim()}
          className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-1">{emptyLabel}</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) =>
            editingId === item.id ? (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(item.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className={cn(inputCls, "flex-1 min-w-0")}
                />
                <button
                  type="button"
                  onClick={() => rename(item.id)}
                  disabled={busy || !editValue.trim()}
                  className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 transition-colors shrink-0"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5"
              >
                <span className="flex-1 min-w-0 truncate text-[13px] text-foreground">
                  {item.name}
                  {item.marker && (
                    <span className="ml-1.5 text-[10px] text-primary">
                      {item.marker}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
                  {item.usage}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditValue(item.name);
                  }}
                  disabled={busy}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={`Rename ${item.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!item.undeletable && (
                  <button
                    type="button"
                    onClick={() =>
                      confirm(`Remove ${item.name} from the list?`) &&
                      run(() => onDelete(item), "Failed to remove")
                    }
                    disabled={busy}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Reads "2 rounds · 1 entry", or "unused" when nothing points at the row yet. */
function usageLabel(counts: { label: string; n: number }[]) {
  const used = counts.filter((c) => c.n > 0);
  if (used.length === 0) return "unused";
  return used
    .map((c) => `${c.n} ${c.label}${c.n === 1 ? "" : "s"}`)
    .join(" · ");
}

/**
 * A name's profile, opened in place of its row. Everything but the name is
 * optional — a fund on a cap table rarely has a face or a bio, and a person
 * usually does.
 */
function HolderEditor({
  holder,
  busy,
  onSave,
  onCancel,
}: {
  holder: EquityHolderDTO;
  busy: boolean;
  onSave: (patch: {
    name: string;
    photoUrl: string | null;
    bio: string;
    linkedinUrl: string;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(holder.name);
  const [photoUrl, setPhotoUrl] = useState(holder.photoUrl);
  const [bio, setBio] = useState(holder.bio ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(holder.linkedinUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadFileToR2(file);
      setPhotoUrl(url);
    } catch (err) {
      alert((err as Error).message || "Failed to upload the photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3.5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 space-y-1.5">
          <HolderAvatar name={name} photoUrl={photoUrl} size={14} />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickPhoto(e.target.files?.[0])}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 px-1.5 h-6 rounded-md border border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-40"
            >
              {uploading ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Upload className="w-2.5 h-2.5" />
              )}
              Photo
            </button>
            {photoUrl && (
              <button
                type="button"
                onClick={() => setPhotoUrl(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Remove photo"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>LinkedIn</label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/…"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div>
        <label className={labelCls}>Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Who they are and what they bring to the table."
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-y"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 h-9 rounded-lg text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave({ name: name.trim(), photoUrl, bio, linkedinUrl })}
          disabled={busy || uploading || !name.trim()}
          className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/**
 * The names themselves, which carry a face and a line about who they are on top
 * of the label the equity forms pick from. Same rules as the plain list: a
 * rename follows the name everywhere, and one still in use can't be removed.
 */
function HolderList({ holders }: { holders: EquityHolderDTO[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      alert((err as Error).message || failure);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!draft.trim()) return;
    await run(async () => {
      await addEquityHolder({ name: draft.trim() });
      setDraft("");
    }, "Failed to add");
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-[13px] font-semibold text-foreground">Names</h2>
        <span className="text-[11px] text-muted-foreground/60 tabular-nums">
          {holders.length}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Everyone who can hold equity — us, founders, funds, option pools. Shared
        across every startup, so a fund on two cap tables is one name in both.
        Add a photo, a bio and a LinkedIn so a cap table reads as people.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="e.g. Nizek"
          className={cn(inputCls, "flex-1 min-w-0")}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !draft.trim()}
          className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {holders.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-1">No names yet.</p>
      ) : (
        <div className="space-y-1">
          {holders.map((holder) =>
            editingId === holder.id ? (
              <HolderEditor
                key={holder.id}
                holder={holder}
                busy={busy}
                onCancel={() => setEditingId(null)}
                onSave={(patch) =>
                  run(async () => {
                    await updateEquityHolder(holder.id, patch);
                    setEditingId(null);
                  }, "Failed to save")
                }
              />
            ) : (
              <div
                key={holder.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2"
              >
                <HolderAvatar name={holder.name} photoUrl={holder.photoUrl} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-foreground">
                      {holder.name}
                    </span>
                    {holder.isUs && (
                      <span className="text-[10px] text-primary">us</span>
                    )}
                    {holder.linkedinUrl && (
                      <a
                        href={holder.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={holder.linkedinUrl}
                        className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        aria-label={`${holder.name} on LinkedIn`}
                      >
                        LinkedIn
                        <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
                      </a>
                    )}
                  </div>
                  {holder.bio && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {holder.bio}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
                  {usageLabel([
                    { label: "entry", n: holder.grantCount },
                    { label: "team", n: holder.teamCount },
                  ])}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(holder.id)}
                  disabled={busy}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={`Edit ${holder.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {!holder.isUs && (
                  <button
                    type="button"
                    onClick={() =>
                      confirm(`Remove ${holder.name} from the list?`) &&
                      run(
                        () => deleteEquityHolder(holder.id),
                        "Failed to remove",
                      )
                    }
                    disabled={busy}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`Remove ${holder.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function EquityRegistryManager({
  holders,
  roles,
}: {
  holders: EquityHolderDTO[];
  roles: EquityRoleDTO[];
}) {
  return (
    <div className="space-y-4">
      <HolderList holders={holders} />

      <RegistryList
        title="Roles"
        icon={<Tag className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />}
        description="The capacity a name holds equity in on a deal. Picked per equity entry, so the same party can appear in different roles across projects."
        placeholder="e.g. Development partner"
        emptyLabel="No roles yet."
        items={roles.map((r) => ({
          id: r.id,
          name: r.name,
          usage: usageLabel([{ label: "entry", n: r.grantCount }]),
        }))}
        onAdd={async (name) => {
          await addEquityRole({ name });
        }}
        onRename={async (id, name) => {
          await updateEquityRole(id, { name });
        }}
        onDelete={async (item) => {
          await deleteEquityRole(item.id);
        }}
      />
    </div>
  );
}
