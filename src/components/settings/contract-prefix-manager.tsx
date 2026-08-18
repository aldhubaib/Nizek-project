"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2, X, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddButton } from "@/components/add-button";
import {
  createContractPrefix,
  updateContractPrefix,
  deleteContractPrefix,
} from "@/actions/contract-prefix";

interface ContractPrefixItem {
  id: string;
  prefix: string;
  name: string;
  _count: { contracts: number };
}

export function ContractPrefixManager({ prefixes }: { prefixes: ContractPrefixItem[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newPrefix, setNewPrefix] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrefix, setEditPrefix] = useState("");
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function handleCreate() {
    if (!newPrefix.trim() || !newName.trim()) return;
    setSaving(true);
    setError("");
    const result = await createContractPrefix({ prefix: newPrefix.trim(), name: newName.trim() });
    if (result && "error" in result) {
      setError(result.error as string);
    } else {
      setNewPrefix("");
      setNewName("");
      setCreating(false);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleUpdate(id: string) {
    if (!editPrefix.trim() || !editName.trim()) return;
    setSaving(true);
    setError("");
    const result = await updateContractPrefix({ id, prefix: editPrefix.trim(), name: editName.trim() });
    if (result && "error" in result) {
      setError(result.error as string);
    } else {
      setEditingId(null);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError("");
    const result = await deleteContractPrefix(id);
    if (result && "error" in result) {
      setDeleteError(result.error as string);
      setTimeout(() => setDeleteError(""), 3000);
    } else {
      router.refresh();
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-s font-semibold">Contract Prefixes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define prefixes for contract codes (e.g. R for Retainer, L for Lump Sum). Contracts are auto-numbered as R-001, R-002, etc.
          </p>
        </div>
        {!creating && (
          <AddButton
            label="New Prefix"
            onClick={() => { setCreating(true); setError(""); }}
          />
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <Input
            value={newPrefix}
            onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
            placeholder="Prefix (e.g. R)"
            className="text-s h-8 w-24 font-mono uppercase"
            autoFocus
            maxLength={5}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setCreating(false); setNewPrefix(""); setNewName(""); }
            }}
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (e.g. Retainer)"
            className="text-s h-8 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewPrefix(""); setNewName(""); }
            }}
          />
          <Button size="sm" onClick={handleCreate} disabled={saving || !newPrefix.trim() || !newName.trim()} className="h-8 px-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewPrefix(""); setNewName(""); }} className="h-8 px-2">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {error && <p className="text-s text-destructive">{error}</p>}
      {deleteError && <p className="text-s text-destructive">{deleteError}</p>}

      {prefixes.length === 0 && !creating ? (
        <div className="text-center py-8">
          <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-s text-muted-foreground">No contract prefixes yet. Create your first prefix.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {prefixes.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-muted-foreground/20 transition-colors"
            >
              {editingId === p.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editPrefix}
                    onChange={(e) => setEditPrefix(e.target.value.toUpperCase())}
                    className="text-s h-8 w-24 font-mono uppercase"
                    autoFocus
                    maxLength={5}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-s h-8 flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button size="sm" onClick={() => handleUpdate(p.id)} disabled={saving || !editPrefix.trim() || !editName.trim()} className="h-8 px-2">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-8 px-2">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex items-center justify-center rounded-md border border-border bg-muted px-2 py-0.5 text-s font-mono font-semibold text-foreground">
                      {p.prefix}
                    </span>
                    <span className="text-s font-medium truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {p._count.contracts} contract{p._count.contracts !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => { setEditingId(p.id); setEditPrefix(p.prefix); setEditName(p.name); setError(""); }}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
