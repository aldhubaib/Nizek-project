"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddButton } from "@/components/add-button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  createVaultCredential,
  createVaultFolder,
  deleteVaultCredential,
  deleteVaultFolder,
  getVaultActivity,
  listVaultFolders,
  renameVaultFolder,
  revealVaultSecret,
  updateVaultCredential,
  type VaultActivityDTO,
  type VaultCredentialDTO,
  type VaultFolderDTO,
} from "@/actions/vault";
import {
  VaultFolderToolbar,
  type VaultFolderFilter,
} from "@/components/vault/vault-folders";

const CATEGORY_OPTIONS = [
  { value: "LOGIN", label: "Login" },
  { value: "EMAIL", label: "Email" },
  { value: "API_KEY", label: "API key" },
  { value: "OTHER", label: "Other" },
] as const;

type FormState = {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
  folderId: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
  category: "LOGIN",
  folderId: "",
};

interface VaultCredentialsPanelProps {
  credentials: VaultCredentialDTO[];
  /** When set, new credentials are created for this project and the project column is hidden. */
  projectId?: string;
  showProjectColumn?: boolean;
}

export function VaultCredentialsPanel({
  credentials: initial,
  projectId,
  showProjectColumn = false,
}: VaultCredentialsPanelProps) {
  const router = useRouter();
  const [credentials, setCredentials] = useState(initial);
  const [folders, setFolders] = useState<VaultFolderDTO[]>([]);
  const [folderFilter, setFolderFilter] = useState<VaultFolderFilter>("all");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<VaultCredentialDTO | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [revealingEdit, setRevealingEdit] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<VaultCredentialDTO | null>(null);
  const [history, setHistory] = useState<VaultActivityDTO[] | null>(null);

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setCredentials(initial);
  }, [initial]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listVaultFolders(projectId)
      .then((rows) => {
        if (!cancelled) setFolders(rows);
      })
      .catch(() => {
        if (!cancelled) setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const unfiledCount = useMemo(
    () => credentials.filter((c) => !c.folderId).length,
    [credentials],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return credentials.filter((c) => {
      if (folderFilter === "all" && !q && c.folderId) return false;
      if (folderFilter === "unfiled" && c.folderId) return false;
      if (
        folderFilter !== "all" &&
        folderFilter !== "unfiled" &&
        c.folderId !== folderFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.username ?? "").toLowerCase().includes(q) ||
        (c.url ?? "").toLowerCase().includes(q) ||
        c.projectName.toLowerCase().includes(q) ||
        (c.folderName ?? "").toLowerCase().includes(q)
      );
    });
  }, [credentials, query, folderFilter]);

  function defaultFolderId() {
    if (folderFilter !== "all" && folderFilter !== "unfiled") return folderFilter;
    return "";
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, folderId: defaultFolderId() });
    setError(null);
    setShowPassword(false);
    setEditorOpen(true);
  }

  function openEdit(c: VaultCredentialDTO) {
    setEditing(c);
    setForm({
      title: c.title,
      username: c.username ?? "",
      password: "",
      url: c.url ?? "",
      notes: "",
      category: c.category ?? "LOGIN",
      folderId: c.folderId ?? "",
    });
    setError(null);
    setShowPassword(false);
    setRevealingEdit(false);
    setEditorOpen(true);
    if (c.hasPassword || c.hasNotes) {
      Promise.allSettled([
        c.hasPassword ? revealVaultSecret(c.id, "password") : null,
        c.hasNotes ? revealVaultSecret(c.id, "notes") : null,
      ].filter(Boolean) as Promise<Awaited<ReturnType<typeof revealVaultSecret>>>[]).then(
        (results) => {
          const pwResult = c.hasPassword ? results[0] : null;
          const notesResult = c.hasNotes ? results[c.hasPassword ? 1 : 0] : null;
          setForm((f) => ({
            ...f,
            ...(pwResult?.status === "fulfilled" && pwResult.value.ok
              ? { password: pwResult.value.data.value ?? "" }
              : {}),
            ...(notesResult?.status === "fulfilled" && notesResult.value.ok
              ? { notes: notesResult.value.data.value ?? "" }
              : {}),
          }));
        },
      );
    }
    if (!projectId) {
      listVaultFolders(c.projectId)
        .then(setFolders)
        .catch(() => setFolders([]));
    }
  }

  function applyCredential(next: VaultCredentialDTO, previousFolderId?: string | null) {
    setCredentials((prev) => {
      const exists = prev.some((c) => c.id === next.id);
      const list = exists
        ? prev.map((c) => (c.id === next.id ? next : c))
        : [...prev, next];
      return list.sort((a, b) => a.title.localeCompare(b.title));
    });
    if (!projectId) return;
    setFolders((prev) =>
      prev.map((folder) => {
        let delta = 0;
        if (previousFolderId === folder.id) delta -= 1;
        if (next.folderId === folder.id) delta += 1;
        if (delta === 0) return folder;
        return {
          ...folder,
          credentialCount: Math.max(0, folder.credentialCount + delta),
        };
      }),
    );
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        if (editing) {
          const result = await updateVaultCredential(editing.id, {
            title: form.title,
            username: form.username,
            url: form.url,
            category: form.category,
            folderId: form.folderId || null,
            ...(form.password.trim()
              ? { password: form.password }
              : {}),
            ...(form.notes.trim() ? { notes: form.notes } : {}),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          applyCredential(result.data, editing.folderId);
        } else {
          const targetProjectId = projectId;
          if (!targetProjectId) {
            setError("Pick a project first");
            return;
          }
          const result = await createVaultCredential({
            projectId: targetProjectId,
            title: form.title,
            username: form.username,
            password: form.password,
            url: form.url,
            notes: form.notes,
            category: form.category,
            folderId: form.folderId || null,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          applyCredential(result.data);
        }
        setEditorOpen(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message || "Failed to save");
      }
    });
  }

  async function openHistory(c: VaultCredentialDTO) {
    setHistoryFor(c);
    setHistory(null);
    setHistoryOpen(true);
    setHistory(await getVaultActivity(c.id));
  }

  async function toggleReveal(c: VaultCredentialDTO) {
    if (revealed[c.id] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      return;
    }
    setBusyId(c.id);
    try {
      const result = await revealVaultSecret(c.id, "password");
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setRevealed((prev) => ({ ...prev, [c.id]: result.data.value ?? "" }));
    } catch (err) {
      alert((err as Error).message || "Could not reveal password");
    } finally {
      setBusyId(null);
    }
  }

  async function copyPassword(c: VaultCredentialDTO) {
    setBusyId(c.id);
    try {
      let value = revealed[c.id];
      if (value === undefined) {
        const res = await revealVaultSecret(c.id, "password");
        if (!res.ok) {
          alert(res.error);
          return;
        }
        value = res.data.value ?? "";
      }
      if (!value) {
        alert("No password stored");
        return;
      }
      await navigator.clipboard.writeText(value);
    } catch (err) {
      alert((err as Error).message || "Could not copy");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(c: VaultCredentialDTO) {
    if (
      !confirm(
        `Move “${c.title}” to the trash? Only an admin can restore or permanently delete it.`,
      )
    ) {
      return;
    }
    setBusyId(c.id);
    try {
      const result = await deleteVaultCredential(c.id);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      setCredentials((prev) => prev.filter((x) => x.id !== c.id));
      if (c.folderId) {
        setFolders((prev) =>
          prev.map((folder) =>
            folder.id === c.folderId
              ? {
                  ...folder,
                  credentialCount: Math.max(0, folder.credentialCount - 1),
                }
              : folder,
          ),
        );
      }
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Could not delete");
    } finally {
      setBusyId(null);
    }
  }

  const canCreate = Boolean(projectId);

  async function handleCreateFolder(name: string) {
    if (!projectId) return { ok: false as const, error: "No project" };
    const result = await createVaultFolder(projectId, name);
    if (result.ok) {
      setFolders((prev) =>
        [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      router.refresh();
    }
    return result;
  }

  async function handleRenameFolder(id: string, name: string) {
    const result = await renameVaultFolder(id, name);
    if (result.ok) {
      setFolders((prev) =>
        prev
          .map((f) => (f.id === id ? result.data : f))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCredentials((prev) =>
        prev.map((c) =>
          c.folderId === id ? { ...c, folderName: result.data.name } : c,
        ),
      );
      router.refresh();
    }
    return result;
  }

  async function handleDeleteFolder(id: string) {
    const result = await deleteVaultFolder(id);
    if (result.ok) {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setCredentials((prev) =>
        prev.map((c) =>
          c.folderId === id ? { ...c, folderId: null, folderName: null } : c,
        ),
      );
      router.refresh();
    }
    return result;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-[16rem] flex-1">
          <SearchIcon />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={projectId ? "Search in this project" : "Search credentials"}
            className="h-9 ps-8 text-s"
          />
        </div>
        {canCreate && (
          <AddButton label="Add credential" onClick={openCreate} />
        )}
      </div>

      {projectId && (
        <VaultFolderToolbar
          folders={folders}
          unfiledCount={unfiledCount}
          filter={folderFilter}
          onFilterChange={setFolderFilter}
          onCreate={handleCreateFolder}
          onRename={handleRenameFolder}
          onDelete={handleDeleteFolder}
        />
      )}

      {filtered.length === 0 ? (
        folderFilter === "all" && folders.length > 0 && !query.trim() ? null : (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-s font-medium text-foreground">
            {credentials.length === 0
              ? "No credentials yet"
              : folderFilter !== "all" && folderFilter !== "unfiled" && !query.trim()
                ? "This folder is empty"
                : "No matches"}
          </p>
          <p className="mt-1 text-s text-muted-foreground">
            {folderFilter !== "all" && credentials.length > 0
              ? "Add a credential here, or pick another folder."
              : "Store logins, emails, and API keys for this project — like a password manager."}
          </p>
          {canCreate && (credentials.length === 0 || folderFilter !== "all") && !query.trim() && (
            <AddButton
              label={credentials.length === 0 ? "Add the first one" : "Add credential"}
              className="mt-4"
              onClick={openCreate}
            />
          )}
        </div>
        )
      ) : (
        <div className="space-y-2">
          {folderFilter === "all" && !query.trim() && unfiledCount > 0 && (
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unfiled
            </p>
          )}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border/50">
            {filtered.map((c) => {
              const shown = revealed[c.id];
              const busy = busyId === c.id;
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-s font-semibold">
                        {c.title}
                      </p>
                      {c.category && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {CATEGORY_OPTIONS.find((o) => o.value === c.category)
                            ?.label ?? c.category}
                        </span>
                      )}
                      {c.folderName && (
                        <span className="rounded-full bg-orange/15 px-2 py-0.5 text-xs font-medium text-orange dark:text-orange">
                          {c.folderName}
                        </span>
                      )}
                    </div>
                    {showProjectColumn && (
                      <Link
                        href={`/dashboard/projects/${c.projectId}?tab=vault`}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {c.projectName}
                      </Link>
                    )}
                    <p className="truncate font-mono text-s text-muted-foreground">
                      {c.username || "No username"}
                      {c.hasPassword && (
                        <>
                          {" · "}
                          {shown !== undefined ? (
                            <span className="text-foreground">
                              {shown || "(empty)"}
                            </span>
                          ) : (
                            "••••••••"
                          )}
                        </>
                      )}
                    </p>
                    {c.url && (
                      <a
                        href={c.url.startsWith("http") ? c.url : `https://${c.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-primary hover:underline"
                      >
                        {c.url}
                      </a>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {c.hasPassword && (
                      <>
                        <IconBtn
                          title={shown !== undefined ? "Hide" : "Reveal"}
                          disabled={busy}
                          onClick={() => toggleReveal(c)}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : shown !== undefined ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </IconBtn>
                        <IconBtn
                          title="Copy password"
                          disabled={busy}
                          onClick={() => copyPassword(c)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </IconBtn>
                      </>
                    )}
                    <IconBtn title="History" onClick={() => openHistory(c)}>
                      <History className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn title="Edit" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      title="Move to trash"
                      disabled={busy}
                      onClick={() => remove(c)}
                      danger
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit credential" : "Add credential"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Production admin"
              />
            </Field>
            <Field label="Username / email">
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="user@example.com"
                autoComplete="off"
              />
            </Field>
            <Field
              label={
                editing
                  ? "Password (leave blank to keep)"
                  : "Password"
              }
            >
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={editing ? "••••••••" : ""}
                  autoComplete="new-password"
                  className="pe-9"
                />
                <button
                  type="button"
                  disabled={revealingEdit}
                  onClick={async () => {
                    if (showPassword) {
                      setShowPassword(false);
                      return;
                    }
                    if (editing && !form.password) {
                      setRevealingEdit(true);
                      try {
                        const res = await revealVaultSecret(editing.id, "password");
                        if (res.ok && res.data.value) {
                          setForm((f) => ({ ...f, password: res.data.value! }));
                        }
                      } catch { /* ignore */ } finally {
                        setRevealingEdit(false);
                      }
                    }
                    setShowPassword(true);
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {revealingEdit ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </Field>
            <Field label="URL">
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://"
              />
            </Field>
            {folders.length > 0 && (
              <Field label="Folder">
                <select
                  value={form.folderId}
                  onChange={(e) =>
                    setForm({ ...form, folderId: e.target.value })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-s"
                >
                  <option value="">Unfiled</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Category">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-s"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={
                editing
                  ? "Notes (leave blank to keep; type to replace)"
                  : "Notes"
              }
            >
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Recovery codes, 2FA hints…"
              />
            </Field>
            {error && (
              <p className="text-s text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.title.trim()}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : editing ? (
                "Save"
              ) : (
                "Add"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              History{historyFor ? ` — ${historyFor.title}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto py-1">
            {history === null ? (
              <p className="text-s text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-s text-muted-foreground">No history yet</p>
            ) : (
              history.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-s">{label}</Label>
      {children}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40",
        danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function HistoryRow({ entry }: { entry: VaultActivityDTO }) {
  const when = formatDistanceToNow(new Date(entry.createdAt), {
    addSuffix: true,
  });
  const actionLabel =
    entry.action === "created"
      ? "Created"
      : entry.action === "deleted"
        ? "Deleted"
        : entry.action === "restored"
          ? "Restored"
          : entry.action === "revealed"
            ? "Revealed"
            : "Updated";

  return (
    <div className="flex gap-s">
      <Avatar size="sm" className="mt-0.5">
        <AvatarImage src={entry.user.imageUrl ?? undefined} />
        <AvatarFallback>
          {(entry.user.name ?? "?").slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-s text-foreground">
          <span className="font-medium">{entry.user.name ?? "Someone"}</span>
          {" "}
          <span className="text-muted-foreground">{actionLabel.toLowerCase()}</span>
          {entry.label ? (
            <>
              {" "}
              <span className="font-medium">{entry.label}</span>
            </>
          ) : null}
        </p>
        {(entry.oldValue || entry.newValue) && entry.action !== "revealed" && (
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {entry.oldValue ?? "—"}
            {" → "}
            {entry.newValue ?? "—"}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground/70">{when}</p>
      </div>
    </div>
  );
}
