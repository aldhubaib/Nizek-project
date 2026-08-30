"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ImagePlus,
  Info,
  Link2,
  Loader2,
  Pencil,
  Shuffle,
  Trash2,
  UserRound,
  Upload,
  UserRoundSearch,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { PageHeaderActions } from "@/components/page-header-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseAliasImport } from "@/lib/alias-import";
import {
  backfillAliasAssignments,
  createAliasesBulk,
  deleteAlias,
  replaceAliasPhoto,
  reshuffleAliasPool,
  updateAlias,
  type AliasDTO,
  type AliasStatsDTO,
  type AliasUsageDTO,
} from "@/actions/alias";

type View = "pool" | "usage";

const NO_NATIONALITY = "__none__";

/** Stand-in until a photo is attached, same shape as the team and chat avatars. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Distinct nationalities already in the pool, for reuse via datalist. */
function knownNationalities(aliases: AliasDTO[]): string[] {
  return [
    ...new Set(aliases.map((a) => a.nationality).filter((n): n is string => Boolean(n))),
  ].sort((a, b) => a.localeCompare(b));
}

export function AliasManager({
  aliases,
  usage,
  stats,
}: {
  aliases: AliasDTO[];
  usage: AliasUsageDTO[];
  stats: AliasStatsDTO;
}) {
  const [view, setView] = useState<View>("pool");

  return (
    <div className="space-y-6">
      <PageHeaderActions>
        <ImportDialog existingNames={aliases.map((a) => a.name)} />
      </PageHeaderActions>

      <div>
        <h2 className="flex items-center gap-2 text-s font-semibold">
          <UserRoundSearch className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          Aliases
        </h2>
        <p className="mt-1 text-s text-muted-foreground">
          Clients never see real names or photos. Each person on each project claims one
          alias from this pool permanently, matched to their gender and drawn in random
          order. An alias is never reused on another project. People marked{" "}
          <span className="font-medium text-foreground">Exclude from Alias</span> keep
          their real identity. Nationality is for organising the pool — it does not
          affect who gets which alias.
        </p>
      </div>

      <PoolHealth stats={stats} />
      <ExistingMembers stats={stats} />

      <div className="flex gap-xs rounded-lg border border-border bg-card p-1">
        <TabButton active={view === "pool"} onClick={() => setView("pool")}>
          Pool ({aliases.length})
        </TabButton>
        <TabButton active={view === "usage"} onClick={() => setView("usage")}>
          In use ({usage.length})
        </TabButton>
      </div>

      {view === "pool" ? <PoolView aliases={aliases} /> : <UsageView usage={usage} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-s font-medium transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Import lives in a dialog reached from the page header: the pool is loaded in
 * one big paste and then rarely touched, so keeping the form permanently on the
 * page pushed the pool itself below the fold.
 */
function ImportDialog({ existingNames }: { existingNames: string[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" className="me-app shrink-0" />}>
        <Upload className="h-3.5 w-3.5" />
        Bulk upload
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-s font-semibold">Bulk upload aliases</DialogTitle>
          <DialogDescription className="text-s">
            Paste one alias per line as{" "}
            <span className="font-mono text-foreground">
              Full name Gender Nationality
            </span>
            . Spaces, tabs, or commas all work, so a block copied straight out of a
            spreadsheet is fine — a header row is ignored. First and last names have
            to be unique across the pool.
          </DialogDescription>
        </DialogHeader>

        <PasteImport existingNames={existingNames} />
      </DialogContent>
    </Dialog>
  );
}

/** Section shell shared by every block, matching the task detail page. */
function Section({
  icon: Icon,
  title,
  meta,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/50 bg-card px-3 pb-3">
      <div className="flex items-center justify-between gap-s px-1 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-s font-semibold">{title}</h3>
          {meta}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetaRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-field px-3 py-3">
      <span className="text-s text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-s font-medium",
          warn ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Health ──────────────────────────────────────────────────────────────────

function PoolHealth({ stats }: { stats: AliasStatsDTO }) {
  return (
    <Section icon={Info} title="Pool health">
      <div className="space-y-1">
        <MetaRow
          label="Male available"
          value={stats.availableMale}
          warn={stats.availableMale === 0}
        />
        <MetaRow
          label="Female available"
          value={stats.availableFemale}
          warn={stats.availableFemale === 0}
        />
        <MetaRow label="Assigned to a project" value={stats.assignedCount} />
      </div>
    </Section>
  );
}

/**
 * Aliases are claimed when someone is added to a project, so anyone who joined
 * before this feature existed has none. This section is always rendered — the
 * backfill is a one-time action people go looking for, and hiding it inside a
 * conditional warning made it undiscoverable.
 */
function ExistingMembers({ stats }: { stats: AliasStatsDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    assigned: number;
    failed: { userName: string; projectName: string; reason: string }[];
  } | null>(null);

  const pending = stats.unaliased.length;
  const blocked = stats.missingGender.length;
  const aliased = Math.max(0, stats.claimableCount - pending);

  async function runBackfill() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await backfillAliasAssignments());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      icon={Users}
      title="Existing members"
      action={
        <Button
          size="sm"
          onClick={runBackfill}
          disabled={busy || pending === 0}
          className="h-8 shrink-0 gap-xs px-2"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          <span className="text-s">
            {pending > 0 ? `Assign ${pending}` : "Assign aliases"}
          </span>
        </Button>
      }
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between rounded-md border border-border bg-field px-3 py-3">
          <span className="text-s text-muted-foreground">Members with an alias</span>
          <span className="font-mono text-s font-medium text-foreground">
            {aliased} of {stats.claimableCount}
          </span>
        </div>

        {pending > 0 && (
          <div className="rounded-md border border-orange/20 bg-orange/15 px-3 py-3">
            <div className="flex items-start gap-s">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-orange"
                strokeWidth={1.5}
              />
              <div className="min-w-0">
                <p className="text-s font-medium text-foreground">
                  {pending} membership{pending === 1 ? "" : "s"} have no alias yet
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Their real name is what a client sees on{" "}
                  {[...new Set(stats.unaliased.map((u) => u.projectName))]
                    .slice(0, 3)
                    .join(", ")}
                  {new Set(stats.unaliased.map((u) => u.projectName)).size > 3
                    ? " and others"
                    : ""}
                  . Use the button above to claim one for each.
                </p>
              </div>
            </div>
          </div>
        )}

        {blocked > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
            <div className="flex items-start gap-s">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                strokeWidth={1.5}
              />
              <div className="min-w-0 flex-1">
                <p className="text-s font-medium text-destructive">
                  {blocked} {blocked === 1 ? "person has" : "people have"} no gender
                  recorded and cannot be aliased
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Aliases are matched by gender, so these people keep their real name in
                  front of clients until it is set.
                </p>
                <ul className="mt-s space-y-0.5">
                  {stats.missingGender.slice(0, 6).map((m) => (
                    <li key={m.userId} className="text-xs text-muted-foreground">
                      • {m.userName}
                      {m.projectNames.length > 0 && (
                        <span className="text-muted-foreground/60">
                          {" — "}
                          {[...new Set(m.projectNames)].join(", ")}
                        </span>
                      )}
                    </li>
                  ))}
                  {blocked > 6 && (
                    <li className="text-xs text-muted-foreground">
                      • and {blocked - 6} more
                    </li>
                  )}
                </ul>
                <Link
                  href="/dashboard/admin?tab=members"
                  className="mt-s inline-flex items-center gap-xs text-xs font-medium text-primary hover:underline"
                >
                  Set gender on the Members tab
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {pending === 0 && blocked === 0 && (
          <p className="px-1 py-2 text-s text-muted-foreground/60">
            {stats.claimableCount === 0
              ? "No project members need an alias yet."
              : "Every project member has an alias."}
          </p>
        )}

        {result && (
          <div className="rounded-md border border-border bg-field px-3 py-3">
            <p className="text-s text-foreground">
              Assigned {result.assigned} alias{result.assigned === 1 ? "" : "es"}.
              {result.failed.length > 0
                ? ` ${result.failed.length} could not be assigned:`
                : ""}
            </p>
            {result.failed.length > 0 && (
              <ul className="mt-s space-y-0.5">
                {result.failed.slice(0, 5).map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    • {f.userName} on {f.projectName} — {f.reason}
                  </li>
                ))}
                {result.failed.length > 5 && (
                  <li className="text-xs text-muted-foreground">
                    • and {result.failed.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Pool ────────────────────────────────────────────────────────────────────

function PoolView({ aliases }: { aliases: AliasDTO[] }) {
  const [nationalityFilter, setNationalityFilter] = useState<string>("");

  const nationalities = knownNationalities(aliases);

  const visible = nationalityFilter
    ? aliases.filter((a) =>
        nationalityFilter === NO_NATIONALITY
          ? a.nationality === null
          : a.nationality === nationalityFilter,
      )
    : aliases;

  const male = visible.filter((a) => a.gender === "MALE");
  const female = visible.filter((a) => a.gender === "FEMALE");
  const free = aliases.filter((a) => !a.assignedTo && a.active).length;

  return (
    <div className="space-y-6">
      <Section
        icon={UserRound}
        title="Pool"
        meta={
          aliases.length > 0 ? (
            <span className="font-mono text-xs text-muted-foreground">
              {free} of {aliases.length} free
            </span>
          ) : undefined
        }
        action={aliases.length > 0 ? <ReshuffleButton /> : undefined}
      >
        {aliases.length === 0 ? (
          <div className="py-8 text-center">
            <UserRound className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-s text-muted-foreground">
              No aliases yet. Use{" "}
              <span className="font-medium text-foreground">Bulk upload</span> to paste
              a list of names.
            </p>
          </div>
        ) : (
          <div className="space-y-m">
            {nationalities.length > 0 && (
              <NationalityFilter
                aliases={aliases}
                nationalities={nationalities}
                value={nationalityFilter}
                onChange={setNationalityFilter}
              />
            )}
            {visible.length === 0 ? (
              <p className="px-1 py-2 text-s text-muted-foreground/60">
                No aliases with that nationality.
              </p>
            ) : (
              <>
                <AliasGroup label="Male" aliases={male} nationalities={nationalities} />
                <AliasGroup
                  label="Female"
                  aliases={female}
                  nationalities={nationalities}
                />
              </>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function NationalityFilter({
  aliases,
  nationalities,
  value,
  onChange,
}: {
  aliases: AliasDTO[];
  nationalities: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const unset = aliases.filter((a) => a.nationality === null).length;

  // Free counts drive curation: an admin needs to see which nationality is
  // running low, not just how many exist.
  const freeFor = (nationality: string | null) =>
    aliases.filter((a) => a.nationality === nationality && !a.assignedTo && a.active)
      .length;

  const chips: { key: string; label: string; count: number }[] = [
    {
      key: "",
      label: "All",
      count: aliases.filter((a) => !a.assignedTo && a.active).length,
    },
    ...nationalities.map((n) => ({ key: n, label: n, count: freeFor(n) })),
  ];
  if (unset > 0) {
    chips.push({ key: NO_NATIONALITY, label: "Unset", count: freeFor(null) });
  }

  return (
    <div className="flex flex-wrap gap-xs px-1">
      {chips.map((chip) => (
        <button
          key={chip.key || "all"}
          type="button"
          onClick={() => onChange(chip.key)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            value === chip.key
              ? "border-primary/30 bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {chip.label}
          <span className="ml-1 font-mono opacity-60">{chip.count}</span>
        </button>
      ))}
    </div>
  );
}

function ReshuffleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setDone(null);
    try {
      const res = await reshuffleAliasPool();
      setDone(res.reshuffled);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-s">
      {done !== null && (
        <span className="text-xs text-muted-foreground">Re-rolled {done}</span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title="Randomise the order unclaimed aliases are handed out in"
        className="flex items-center gap-xs rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Shuffle className="h-3.5 w-3.5" />
        )}
        Re-shuffle
      </button>
    </div>
  );
}

// ─── Paste import ────────────────────────────────────────────────────────────

const PASTE_PLACEHOLDER = `Aarav Agarwal Male Indian
Fatima Al Ali Female Pakistani
Ehsan Rahimi Male Iranian`;

function PasteImport({ existingNames }: { existingNames: string[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const parsed = parseAliasImport(text, { existingNames });
  const maleCount = parsed.rows.filter((r) => r.gender === "MALE").length;
  const femaleCount = parsed.rows.length - maleCount;

  async function importRows() {
    if (parsed.rows.length === 0) return;
    setSaving(true);
    setError("");
    setResult(null);
    try {
      const res = await createAliasesBulk(
        parsed.rows.map((r) => ({
          name: r.name,
          gender: r.gender,
          nationality: r.nationality,
        })),
      );
      if ("error" in res) {
        setError(res.error);
      } else {
        setText("");
        const parts = [`Added ${res.created} alias${res.created === 1 ? "" : "es"}.`];
        if (res.skipped.length > 0) {
          parts.push(
            `Skipped ${res.skipped.length} — ${res.skipped[0].name}: ${res.skipped[0].reason.toLowerCase()}.`,
          );
        }
        setResult(parts.join(" "));
        router.refresh();
      }
    } catch {
      setError("Import failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PASTE_PLACEHOLDER}
        rows={7}
        spellCheck={false}
        disabled={saving}
        className="w-full resize-y rounded-md border border-border bg-field px-3 py-3 font-mono text-s text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:opacity-60"
      />

      <p className="px-1 pt-1 text-xs text-muted-foreground">
        The gender word splits each line, so both the name and the nationality can be
        several words. Every line needs a gender; nationality is optional. A row is
        skipped if its first or last name is already taken. Photos can be attached to
        any alias later.
      </p>

      {parsed.rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-s rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="text-s">
            <span className="font-medium">{parsed.rows.length} ready</span>
            <span className="text-muted-foreground">
              {" — "}
              {maleCount} male, {femaleCount} female
            </span>
          </span>
          <Button size="sm" onClick={importRows} disabled={saving} className="h-8 px-3">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="text-s">Add {parsed.rows.length}</span>
            )}
          </Button>
        </div>
      )}

      {parsed.issues.length > 0 && (
        <div className="space-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="text-xs font-medium text-destructive">
            {parsed.issues.length} line{parsed.issues.length === 1 ? "" : "s"} will be
            skipped
          </p>
          {parsed.issues.slice(0, 4).map((issue) => (
            <p key={issue.line} className="text-xs text-destructive/80">
              • Line {issue.line}: {issue.reason}
            </p>
          ))}
          {parsed.issues.length > 4 && (
            <p className="text-xs text-destructive/80">
              • and {parsed.issues.length - 4} more
            </p>
          )}
        </div>
      )}

      {parsed.duplicates.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {parsed.duplicates.length} line
          {parsed.duplicates.length === 1 ? "" : "s"} already in the pool or repeated in
          this paste — skipped.
        </p>
      )}

      {result && <p className="px-1 text-s text-foreground">{result}</p>}
      {error && <p className="px-1 text-s text-destructive">{error}</p>}
    </div>
  );
}

// ─── Pool list ───────────────────────────────────────────────────────────────

function AliasGroup({
  label,
  aliases,
  nationalities,
}: {
  label: string;
  aliases: AliasDTO[];
  nationalities: string[];
}) {
  if (aliases.length === 0) return null;
  const free = aliases.filter((a) => !a.assignedTo && a.active).length;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-s px-1">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {free} of {aliases.length} free
        </span>
      </div>
      {aliases.map((a) => (
        <AliasRow key={a.id} alias={a} nationalities={nationalities} />
      ))}
    </div>
  );
}

function AliasRow({
  alias,
  nationalities,
}: {
  alias: AliasDTO;
  nationalities: string[];
}) {
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(alias.name);
  const [nationality, setNationality] = useState(alias.nationality ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const locked = alias.assignedTo !== null;

  function cancelEdit() {
    setEditing(false);
    setName(alias.name);
    setNationality(alias.nationality ?? "");
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    const res = await updateAlias({
      id: alias.id,
      name: name.trim(),
      nationality: nationality.trim() || null,
    });
    if ("error" in res) setError(res.error);
    else {
      setEditing(false);
      router.refresh();
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError("");
    const res = await deleteAlias(alias.id);
    if ("error" in res) {
      setError(res.error);
      setTimeout(() => setError(""), 4000);
    } else {
      router.refresh();
    }
    setBusy(false);
  }

  async function toggleActive() {
    setBusy(true);
    setError("");
    const res = await updateAlias({ id: alias.id, active: !alias.active });
    if ("error" in res) setError(res.error);
    else router.refresh();
    setBusy(false);
  }

  async function onPhoto(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("id", alias.id);
    fd.set("file", files[0]);
    const res = await replaceAliasPhoto(fd);
    if ("error" in res) setError(res.error);
    else router.refresh();
    setBusy(false);
    if (photoRef.current) photoRef.current.value = "";
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-field px-3 py-2.5 transition-colors hover:border-muted-foreground/20",
        !alias.active && "opacity-60",
      )}
    >
      <div className="flex items-center gap-s">
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          disabled={busy}
          aria-label={`Replace photo for ${alias.name}`}
          className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted"
        >
          {alias.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={alias.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-primary/15 text-s font-semibold text-primary">
              {initialsOf(alias.name)}
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
            <ImagePlus className="h-3.5 w-3.5 text-white" />
          </span>
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPhoto(e.target.files)}
        />

        {editing ? (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 flex-1 text-s"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <Input
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="Nationality"
              list="alias-nationalities-row"
              className="h-8 w-32 text-s"
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <datalist id="alias-nationalities-row">
              {nationalities.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <Button
              size="sm"
              onClick={save}
              disabled={busy || !name.trim()}
              className="h-8 px-2"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8 px-2">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-s">
                <span className="truncate text-s font-medium">{alias.name}</span>
                {alias.nationality && (
                  <span className="shrink-0 rounded-full border border-border bg-surface px-1.5 py-0.5 text-xs text-muted-foreground">
                    {alias.nationality}
                  </span>
                )}
              </div>
              {alias.assignedTo ? (
                <div className="truncate text-xs text-muted-foreground">
                  {alias.assignedTo.userName} · {alias.assignedTo.projectName}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {alias.active ? "Available" : "On hold"}
                </div>
              )}
            </div>
            {locked && (
              <span className="shrink-0 rounded-full border border-primary/20 bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                In use
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={`Edit ${alias.name}`}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {!locked && (
                <>
                  <button
                    type="button"
                    onClick={toggleActive}
                    disabled={busy}
                    className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    {alias.active ? "Hold" : "Release"}
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy}
                    aria-label={`Delete ${alias.name}`}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {error && <p className="mt-s text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Usage ───────────────────────────────────────────────────────────────────

function UsageView({ usage }: { usage: AliasUsageDTO[] }) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? usage.filter((u) => {
        const q = query.toLowerCase();
        return (
          u.aliasName.toLowerCase().includes(q) ||
          u.userName.toLowerCase().includes(q) ||
          u.projectName.toLowerCase().includes(q)
        );
      })
    : usage;

  return (
    <Section
      icon={Link2}
      title="Assigned aliases"
      meta={
        usage.length > 0 ? (
          <span className="font-mono text-xs text-muted-foreground">{usage.length}</span>
        ) : undefined
      }
    >
      {usage.length === 0 ? (
        <div className="py-8 text-center">
          <UserRound className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-s text-muted-foreground">
            No aliases assigned yet. They are claimed automatically when someone joins a
            project.
          </p>
        </div>
      ) : (
        <div className="space-y-m">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search alias, person, or project"
            className="h-8 text-s"
          />

          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-s border-b border-border bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span>Alias shown to client</span>
              <span>Real person</span>
              <span>Project</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-[1fr_1fr_1fr] items-center gap-s bg-field px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-s">
                    {u.aliasImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.aliasImageUrl}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
                        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    )}
                    <span className="truncate text-s font-medium">{u.aliasName}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-s">
                    {u.userImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.userImageUrl}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
                        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    )}
                    <span className="truncate text-s text-muted-foreground">
                      {u.userName}
                    </span>
                  </div>
                  <span className="truncate text-s text-muted-foreground">
                    {u.projectName}
                  </span>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-s text-muted-foreground">
                  No matches.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
