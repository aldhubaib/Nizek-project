"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff, Folder, Pencil, Plus, Trash2 } from "lucide-react";

import { useCreateCredential, useCreateFolder, useDeleteCredential, useDeleteFolder, useRenameFolder, useRevealSecret, useUpdateCredential, useVaultFolders, type VaultCredentialDTO } from "@/next-ui/data/vault";
import { ConfirmDialog, ErrorNote, errorText } from "@/next-ui/patterns/form-bits";
import { Button } from "@/next-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";
import { Textarea } from "@/next-ui/ui/textarea";

/**
 * The vault's writes: an entry added or edited (title, user name, password, site, notes, kind,
 * folder), a secret shown and copied for the moment it is needed (every reveal is written to
 * the vault's activity on the server), an entry deleted, and the folders. All through the
 * vault actions the live panel calls, which check the viewer's vault access again.
 */

export const CATEGORY_LABEL: Record<string, string> = {
  LOGIN: "Login",
  EMAIL: "Email",
  API_KEY: "API key",
  OTHER: "Other",
};

type Draft = { title: string; username: string; password: string; url: string; notes: string; category: string; folderId: string };

function draftOf(c: VaultCredentialDTO | null): Draft {
  return { title: c?.title ?? "", username: c?.username ?? "", password: "", url: c?.url ?? "", notes: "", category: c?.category ?? "LOGIN", folderId: c?.folderId ?? "none" };
}

/**
 * New or existing entry. An existing entry's secrets are not loaded with it: the password and
 * notes fields start empty and are only sent when typed into ("Show" reveals what is kept
 * now), and "Remove" clears one on the server.
 */
export function CredentialDialog({ projectId, credential: c, open, onClose }: { projectId: string; credential: VaultCredentialDTO | null; open: boolean; onClose: () => void }) {
  const create = useCreateCredential(projectId);
  const update = useUpdateCredential(projectId);
  const folders = useVaultFolders(projectId, open);
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(c));
  const [clear, setClear] = React.useState({ password: false, notes: false });
  const [error, setError] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setDraft(draftOf(c));
      setClear({ password: false, notes: false });
      setError(null);
    }
  }
  const editing = c != null;
  const busy = create.isPending || update.isPending;
  const canSave = draft.title.trim() !== "" && !busy;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    const fail = (err: unknown) => setError(errorText(err));
    const folderId = draft.folderId === "none" ? null : draft.folderId;
    if (editing) {
      update.mutate(
        {
          id: c.id,
          title: draft.title.trim(),
          username: draft.username.trim() || null,
          url: draft.url.trim() || null,
          category: draft.category,
          folderId,
          ...(draft.password !== "" ? { password: draft.password } : {}),
          ...(draft.notes !== "" ? { notes: draft.notes } : {}),
          clearPassword: clear.password && draft.password === "",
          clearNotes: clear.notes && draft.notes === "",
        },
        { onSuccess: onClose, onError: fail },
      );
      return;
    }
    create.mutate(
      { title: draft.title.trim(), username: draft.username.trim() || null, password: draft.password || null, url: draft.url.trim() || null, notes: draft.notes || null, category: draft.category, folderId },
      { onSuccess: onClose, onError: fail },
    );
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="credential-dialog">
        <form onSubmit={save} className="contents" autoComplete="off">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit entry" : "New entry"}</DialogTitle>
            <DialogDescription>{editing ? "Secrets are not shown here until you ask; type a new one to replace it." : "A login, a mailbox, an API key or anything else kept for this project."}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-0.5">
            <div className="grid gap-4 @sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-title">Title</Label>
                <Input id="cred-title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required maxLength={200} autoFocus data-testid="cred-title" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-kind">Kind</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}>
                  <SelectTrigger id="cred-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 @sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-user">User name</Label>
                <Input id="cred-user" value={draft.username} onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cred-url">Site</Label>
                <Input id="cred-url" value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} placeholder="https://" inputMode="url" />
              </div>
            </div>
            <SecretField
              id="cred-password"
              label="Password"
              kind="password"
              value={draft.password}
              onChange={(v) => setDraft((d) => ({ ...d, password: v }))}
              credential={editing && c.hasPassword ? c : null}
              cleared={clear.password}
              onClear={(v) => setClear((s) => ({ ...s, password: v }))}
            />
            <SecretField id="cred-notes" label="Notes" kind="notes" value={draft.notes} onChange={(v) => setDraft((d) => ({ ...d, notes: v }))} credential={editing && c.hasNotes ? c : null} cleared={clear.notes} onClear={(v) => setClear((s) => ({ ...s, notes: v }))} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cred-folder">Folder</Label>
              <Select value={draft.folderId} onValueChange={(v) => setDraft((d) => ({ ...d, folderId: v }))}>
                <SelectTrigger id="cred-folder" className="w-full">
                  <SelectValue placeholder="No folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder</SelectItem>
                  {(folders.data ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <Folder />
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave} data-testid="cred-save">
              {busy ? "Saving…" : editing ? "Save" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A secret's field: typed fresh, or for an existing entry shown on request and removable. */
function SecretField({ id, label, kind, value, onChange, credential, cleared, onClear }: { id: string; label: string; kind: "password" | "notes"; value: string; onChange: (v: string) => void; credential: VaultCredentialDTO | null; cleared: boolean; onClear: (v: boolean) => void }) {
  const reveal = useRevealSecret();
  const [shown, setShown] = React.useState(false);
  const [current, setCurrent] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const show = () => {
    if (!credential) return;
    setError(null);
    reveal.mutate({ id: credential.id, field: kind }, { onSuccess: (v) => setCurrent(v), onError: (err) => setError(errorText(err)) });
  };
  const hint = credential ? (cleared ? `The ${label.toLowerCase()} will be removed when you save.` : `A ${label.toLowerCase()} is kept. Leave this empty to keep it, or type a new one.`) : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {credential && (
          <span className="flex items-center gap-1">
            {current === null ? (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={show} disabled={reveal.isPending} data-testid={`show-${kind}`}>
                <Eye />
                {reveal.isPending ? "Showing…" : "Show current"}
              </Button>
            ) : (
              <CopyButton value={current} />
            )}
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={() => onClear(!cleared)}>
              {cleared ? "Keep" : "Remove"}
            </Button>
          </span>
        )}
      </div>
      {current !== null && (kind === "password" ? <Input readOnly value={current} className="font-mono" /> : <Textarea readOnly value={current} rows={3} />)}
      {kind === "password" ? (
        <div className="relative">
          <Input id={id} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" placeholder={credential ? "New password" : undefined} className="pe-9 font-mono" disabled={cleared} />
          <Button type="button" variant="ghost" size="icon-xs" aria-label={shown ? "Hide" : "Show"} className="absolute end-1 top-1/2 -translate-y-1/2" onClick={() => setShown((s) => !s)}>
            {shown ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      ) : (
        <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={credential ? "New notes" : "Anything else worth keeping with this entry"} disabled={cleared} />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // the browser refused the clipboard; the value is on screen to select
        }
      }}
      data-testid="copy-secret"
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/** One secret shown for the moment it is needed, with a copy button. */
export function SecretDialog({ credential: c, field, open, onClose }: { credential: VaultCredentialDTO | null; field: "password" | "notes"; open: boolean; onClose: () => void }) {
  const reveal = useRevealSecret();
  const [value, setValue] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const id = c?.id;
  const { mutate } = reveal;
  // a fresh opening starts masked and empty
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setValue(null);
      setHidden(true);
      setError(null);
    }
  }
  // one reveal per opening (each is recorded on the server), after the dialog is on screen
  React.useEffect(() => {
    if (!open || !id) return;
    mutate({ id, field }, { onSuccess: setValue, onError: (err) => setError(errorText(err)) });
  }, [open, id, field, mutate]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="secret-dialog">
        <DialogHeader>
          <DialogTitle>{field === "password" ? "Password" : "Notes"}</DialogTitle>
          <DialogDescription>{c ? `${c.title}${c.username ? ` · ${c.username}` : ""}. This reveal is recorded in the vault's activity.` : ""}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {error ? (
            <ErrorNote>{error}</ErrorNote>
          ) : value === null ? (
            <p className="text-sm text-muted-foreground">Fetching…</p>
          ) : field === "password" ? (
            <div className="flex items-center gap-2">
              <Input readOnly value={hidden ? "•".repeat(Math.min(Math.max(value.length, 8), 24)) : value} className="font-mono" data-testid="secret-value" />
              <Button type="button" variant="outline" size="icon-sm" aria-label={hidden ? "Show" : "Hide"} onClick={() => setHidden((h) => !h)}>
                {hidden ? <Eye /> : <EyeOff />}
              </Button>
              <CopyButton value={value} />
            </div>
          ) : (
            <>
              <Textarea readOnly value={value} rows={6} data-testid="secret-value" />
              <div className="flex justify-end">
                <CopyButton value={value} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCredentialDialog({ projectId, credential: c, open, onClose }: { projectId: string; credential: VaultCredentialDTO | null; open: boolean; onClose: () => void }) {
  const del = useDeleteCredential(projectId);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Delete entry"
      description={c ? `"${c.title}" is removed from the vault. The vault's activity keeps a record that it existed.` : ""}
      confirmLabel="Delete entry"
      busyLabel="Deleting…"
      destructive
      onConfirm={() => (c ? del.mutateAsync(c.id) : undefined)}
      testId="delete-credential-dialog"
    />
  );
}

/** The vault's folders: add one, rename one, remove one (its entries stay, unfiled). */
export function FoldersDialog({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const folders = useVaultFolders(projectId, open);
  const create = useCreateFolder(projectId);
  const rename = useRenameFolder(projectId);
  const remove = useDeleteFolder(projectId);
  const [name, setName] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fail = (err: unknown) => setError(errorText(err));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || create.isPending) return;
    setError(null);
    create.mutate(n, { onSuccess: () => setName(""), onError: fail });
  };
  const saveRename = () => {
    if (!editing) return;
    const n = editing.name.trim();
    const was = folders.data?.find((f) => f.id === editing.id)?.name;
    setEditing(null);
    if (!n || n === was) return;
    setError(null);
    rename.mutate({ id: editing.id, name: n }, { onError: fail });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="folders-dialog">
        <DialogHeader>
          <DialogTitle>Folders</DialogTitle>
          <DialogDescription>Group the entries of this vault. Removing a folder keeps its entries, unfiled.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {folders.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (folders.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No folders yet.</p>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="folder-list">
              {(folders.data ?? []).map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  {editing?.id === f.id ? (
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ id: f.id, name: e.target.value })}
                      onBlur={saveRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveRename();
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      autoFocus
                      className="h-7"
                    />
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{f.credentialCount}</span>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Rename ${f.name}`} onClick={() => setEditing({ id: f.id, name: f.name })}>
                        <Pencil />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${f.name}`} className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(f.id, { onError: fail })}>
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder" maxLength={100} data-testid="new-folder-name" />
            <Button type="submit" size="sm" disabled={name.trim() === "" || create.isPending}>
              <Plus />
              Add
            </Button>
          </form>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
