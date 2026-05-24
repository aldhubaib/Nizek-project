"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Settings, Upload, Trash2, Loader2, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteProject, updateProject } from "@/actions/project";

interface Team {
  id: string;
  name: string;
}

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    logoUrl: string | null;
    team?: Team | null;
    _count: { members: number; tasks: number };
    contracts: { contractType: string; startDate: string | null; endDate: string | null; latePayment: boolean }[];
  };
  teams?: Team[];
}

export function ProjectCard({ project, teams = [] }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const now = new Date();
  const hasValidContract = project.contracts.some((c) => {
    if (c.contractType === "STARTUP") return true;
    if (!c.startDate || !c.endDate) return false;
    return new Date(c.startDate) <= now && new Date(c.endDate) >= now;
  });
  const hasLatePayment = project.contracts.some((c) => c.latePayment && (
    c.contractType === "STARTUP" ||
    (c.startDate && c.endDate && new Date(c.startDate) <= now && new Date(c.endDate) >= now)
  ));
  const isActive = hasValidContract && !hasLatePayment;

  return (
    <>
      <div className="relative group">
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="block rounded-lg bg-card border border-border p-4 hover:border-muted-foreground/20 transition-colors no-underline"
        >
          <div className="flex items-center gap-2.5 mb-3">
            {project.logoUrl ? (
              <img src={project.logoUrl} alt={project.name} className="w-8 h-8 rounded-full object-cover border border-border" />
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
            {project.team && <span className="font-medium text-muted-foreground/80">{project.team.name}</span>}
            <span>{project._count.members} members</span>
            <span>{project._count.tasks} tasks</span>
          </div>
        </Link>

        <div className="absolute top-3 right-3">
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
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); setSettingsOpen(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-foreground hover:bg-accent transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                  Settings
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {settingsOpen && createPortal(
        <ProjectSettingsOverlay
          project={project}
          teams={teams}
          onClose={() => { setSettingsOpen(false); router.refresh(); }}
        />,
        document.body
      )}
    </>
  );
}

function ProjectSettingsOverlay({
  project,
  teams,
  onClose,
}: {
  project: ProjectCardProps["project"];
  teams: Team[];
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logo, setLogo] = useState<string | null>(project.logoUrl);
  const [description, setDescription] = useState(project.description || "");
  const [teamId, setTeamId] = useState(project.team?.id || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  async function handleRemoveLogo() {
    setUploading(true);
    try {
      await updateProject({ projectId: project.id, logoUrl: null });
      setLogo(null);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProject({
        projectId: project.id,
        description,
        ...(teamId && { teamId }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== project.name) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteProject({ projectId: project.id, confirmName: confirmText });
      onClose();
      router.push("/dashboard/projects");
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]">
            <XIcon className="w-4 h-4" />
            Close
          </button>
          <span className="text-border">|</span>
          <span className="text-[13px] font-semibold">{project.name} — Settings</span>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto py-10 px-6 space-y-10">

          {/* Logo */}
          <div className="space-y-3">
            <Label className="text-[13px] font-semibold">Project Photo</Label>
            <div className="flex items-center gap-4">
              {logo ? (
                <div className="relative group/logo">
                  <img
                    src={logo}
                    alt={project.name}
                    className="w-20 h-20 rounded-xl object-cover border border-border"
                  />
                  <button
                    onClick={handleRemoveLogo}
                    disabled={uploading}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-muted border border-dashed border-border flex items-center justify-center">
                  <span className="text-2xl font-bold text-muted-foreground">
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Uploading..." : logo ? "Change" : "Upload"}
                  </span>
                </label>
                <p className="text-[10px] text-muted-foreground/50">Square, max 512KB</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="proj-desc" className="text-[13px] font-semibold">Description</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief project description..."
              rows={4}
              className="text-[13px]"
            />
          </div>

          {/* Team */}
          <div className="space-y-2">
            <Label htmlFor="proj-team" className="text-[13px] font-semibold">Team</Label>
            {teams.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No teams yet. Create one in{" "}
                <a href="/dashboard/settings" className="text-primary underline">Settings</a>.
              </p>
            ) : (
              <select
                id="proj-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
            <div>
              <h3 className="text-[13px] font-semibold text-destructive">Danger Zone</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Permanently delete this project and all its data. This cannot be undone.
              </p>
            </div>

            {!deleteOpen ? (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete Project
              </Button>
            ) : (
              <div className="space-y-3">
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
                {deleteError && <p className="text-[12px] text-destructive">{deleteError}</p>}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={confirmText !== project.name || deleting}
                  >
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                    Delete Forever
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setDeleteOpen(false); setConfirmText(""); setDeleteError(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
