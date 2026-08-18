"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddButton } from "@/components/add-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { VaultFolderDTO } from "@/actions/vault";

export type VaultFolderFilter = "all" | "unfiled" | (string & {});

const SUGGESTED_NAMES = ["DEV", "STAGE", "PROD"];

export function VaultFolderToolbar({
  folders,
  unfiledCount,
  filter,
  onFilterChange,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: VaultFolderDTO[];
  unfiledCount: number;
  filter: VaultFolderFilter;
  onFilterChange: (filter: VaultFolderFilter) => void;
  onCreate: (name: string) => Promise<{ ok: true; data: VaultFolderDTO } | { ok: false; error: string }>;
  onRename: (
    id: string,
    name: string,
  ) => Promise<{ ok: true; data: VaultFolderDTO } | { ok: false; error: string }>;
  onDelete: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VaultFolderDTO | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const usedNames = useMemo(
    () => new Set(folders.map((f) => f.name.toLowerCase())),
    [folders],
  );
  const suggestions = SUGGESTED_NAMES.filter(
    (n) => !usedNames.has(n.toLowerCase()) || editing?.name.toLowerCase() === n.toLowerCase(),
  );

  function openCreate() {
    setEditing(null);
    setName("");
    setError(null);
    setDialogOpen(true);
  }

  function openRename(folder: VaultFolderDTO) {
    setEditing(folder);
    setName(folder.name);
    setError(null);
    setDialogOpen(true);
  }

  function saveFolder() {
    setError(null);
    startSaving(async () => {
      const result = editing
        ? await onRename(editing.id, name)
        : await onCreate(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDialogOpen(false);
      if (!editing && "data" in result) {
        onFilterChange(result.data.id);
      }
    });
  }

  async function removeFolder(folder: VaultFolderDTO) {
    if (
      !confirm(
        `Delete folder “${folder.name}”? Credentials inside it stay in the project and move to Unfiled.`,
      )
    ) {
      return;
    }
    const result = await onDelete(folder.id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    if (filter === folder.id) onFilterChange("all");
  }

  const pills: { id: VaultFolderFilter; label: string; count?: number }[] = [
    {
      id: "all",
      label: "All",
      count:
        folders.reduce((n, f) => n + f.credentialCount, 0) + unfiledCount,
    },
    ...folders.map((f) => ({
      id: f.id as VaultFolderFilter,
      label: f.name,
      count: f.credentialCount,
    })),
  ];
  if (unfiledCount > 0 || filter === "unfiled") {
    pills.push({ id: "unfiled", label: "Unfiled", count: unfiledCount });
  }

  const activeFolder =
    filter !== "all" && filter !== "unfiled"
      ? folders.find((f) => f.id === filter) ?? null
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {folders.length > 0 &&
          pills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => onFilterChange(pill.id)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-s font-medium whitespace-nowrap transition-colors",
                filter === pill.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              {pill.label}
              {pill.count != null && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    filter === pill.id
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {pill.count}
                </span>
              )}
            </button>
          ))}
        {activeFolder && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Folder actions for ${activeFolder.name}`}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
              <DropdownMenuItem onClick={() => openRename(activeFolder)}>
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void removeFolder(activeFolder)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <AddButton label="New folder" onClick={openCreate} />
      </div>

      {filter === "all" && folders.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {folders.map((folder) => (
            <li key={folder.id}>
              <div className="flex items-center rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => onFilterChange(folder.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-accent/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                    <Folder className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-s font-semibold">
                      {folder.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {folder.credentialCount} credential
                      {folder.credentialCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Folder actions for ${folder.name}`}
                    className="me-2 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem onClick={() => openRename(folder)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void removeFolder(folder)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Rename folder" : "New folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-s">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. DEV, STAGE, PROD"
                maxLength={40}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveFolder();
                  }
                }}
              />
            </div>
            {!editing && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setName(suggestion)}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="text-s text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={saveFolder} disabled={saving || !name.trim()}>
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
