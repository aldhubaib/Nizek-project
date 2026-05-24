"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, X, Check, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTeam, updateTeam, deleteTeam } from "@/actions/team";

interface Team {
  id: string;
  name: string;
  _count: { projects: number };
}

export function TeamsManager({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    const result = await createTeam({ name: newName.trim() });
    if (result.error) {
      setError(result.error);
    } else {
      setNewName("");
      setCreating(false);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleUpdate(teamId: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError("");
    const result = await updateTeam({ teamId, name: editName.trim() });
    if (result.error) {
      setError(result.error);
    } else {
      setEditingId(null);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleDelete(teamId: string) {
    setDeletingId(teamId);
    setDeleteError("");
    const result = await deleteTeam(teamId);
    if (result.error) {
      setDeleteError(result.error);
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
          <h2 className="text-[13px] font-semibold">Teams</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Organize projects by team. Each project must belong to a team.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => { setCreating(true); setError(""); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Team
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Team name..."
            className="text-[13px] h-8"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
          />
          <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()} className="h-8 px-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }} className="h-8 px-2">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {deleteError && <p className="text-[12px] text-destructive">{deleteError}</p>}

      {teams.length === 0 && !creating ? (
        <div className="text-center py-8">
          <FolderKanban className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground">No teams yet. Create your first team.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-muted-foreground/20 transition-colors"
            >
              {editingId === team.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-[13px] h-8"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(team.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button size="sm" onClick={() => handleUpdate(team.id)} disabled={saving || !editName.trim()} className="h-8 px-2">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-8 px-2">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium truncate">{team.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {team._count.projects} project{team._count.projects !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => { setEditingId(team.id); setEditName(team.name); setError(""); }}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(team.id)}
                      disabled={deletingId === team.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === team.id ? (
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
