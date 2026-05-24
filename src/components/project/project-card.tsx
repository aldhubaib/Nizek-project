"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Upload, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteProject, updateProject } from "@/actions/project";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    logoUrl: string | null;
    _count: { members: number; tasks: number };
    contracts: { startDate: string; endDate: string; latePayment: boolean }[];
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [logo, setLogo] = useState<string | null>(project.logoUrl);

  const now = new Date();
  const hasValidContract = project.contracts.some(
    (c) => new Date(c.startDate) <= now && new Date(c.endDate) >= now
  );
  const hasLatePayment = project.contracts.some(
    (c) =>
      new Date(c.startDate) <= now &&
      new Date(c.endDate) >= now &&
      c.latePayment
  );
  const isActive = hasValidContract && !hasLatePayment;

  function handleUploadClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      alert("Logo must be under 512KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setUploading(true);
      try {
        await updateProject({ projectId: project.id, logoUrl: dataUrl });
        setLogo(dataUrl);
      } catch (err) {
        console.error(err);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (confirmText !== project.name) return;
    setDeleting(true);
    setError("");
    try {
      await deleteProject({ projectId: project.id, confirmName: confirmText });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="relative group">
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="block rounded-lg bg-card border border-border p-4 hover:border-muted-foreground/20 transition-colors no-underline"
        >
          <div className="flex items-center gap-2.5 mb-3">
            {logo ? (
              <img src={logo} alt={project.name} className="w-8 h-8 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary">
                {project.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground truncate">
                {project.name}
              </p>
            </div>
            {!isActive && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                hasLatePayment
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                  : "bg-destructive/15 text-destructive border-destructive/20"
              }`}>
                {hasLatePayment ? "Late Payment" : "Expired"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{project._count.members} members</span>
            <span>{project._count.tasks} tasks</span>
          </div>
        </Link>

        {/* 3-dot menu */}
        <div className="absolute top-3 right-3" ref={menuRef}>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-1 rounded-md text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 w-44 rounded-lg border border-border bg-popover shadow-xl py-1">
                <button
                  onClick={handleUploadClick}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-foreground hover:bg-accent transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                  Upload Photo
                </button>
                <button
                  onClick={handleDeleteClick}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Project
                </button>
              </div>
            </>
          )}
        </div>

        {uploading && (
          <div className="absolute inset-0 rounded-lg bg-background/80 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); setConfirmText(""); setError(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              This will permanently delete <strong className="text-foreground">{project.name}</strong> and
              all its tasks, notes, assets, contracts, and members.
            </p>
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">
                Type <strong className="text-foreground">{project.name}</strong> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={project.name}
                className="text-[13px]"
                autoFocus
              />
            </div>
            {error && <p className="text-[12px] text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={confirmText !== project.name || deleting}
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
