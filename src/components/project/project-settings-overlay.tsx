"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Loader2, X as XIcon, ScrollText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteProject, updateProject, deleteContract, toggleLatePayment } from "@/actions/project";
import { ContractBadge } from "@/components/project/contract-badge";
import { AddContractDialog } from "@/components/project/add-contract-dialog";
import { EditContractDialog } from "@/components/project/edit-contract-dialog";

interface Team {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  label: string | null;
  code: string | null;
  contractType: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  latePayment: boolean;
}

interface ContractPrefixOption {
  id: string;
  prefix: string;
  name: string;
}

interface ProjectSettingsProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    logoUrl: string | null;
    team?: Team | null;
    contracts: Contract[];
  };
  teams?: Team[];
  contractPrefixes?: ContractPrefixOption[];
  isAdmin?: boolean;
  onClose: () => void;
}

export function ProjectSettingsOverlay({
  project,
  teams = [],
  contractPrefixes = [],
  isAdmin = false,
  onClose,
}: ProjectSettingsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(project.name);
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
        name: name.trim(),
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
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]">
            <XIcon className="w-4 h-4" />
            Close
          </button>
          <span className="text-border">|</span>
          <span className="text-[13px] font-semibold">{name || project.name} — Settings</span>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-10 px-6 space-y-10">

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="proj-name" className="text-[13px] font-semibold">Project Name</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="text-[13px]"
            />
          </div>

          {/* Logo */}
          <div className="space-y-3">
            <Label className="text-[13px] font-semibold">Project Photo</Label>
            <div className="flex items-center gap-4">
              {logo ? (
                <div className="relative group/logo">
                  <img src={logo} alt={project.name} className="w-20 h-20 rounded-xl object-cover border border-border" />
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
                  <span className="text-2xl font-bold text-muted-foreground">{project.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="cursor-pointer">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
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

          {/* Contracts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-semibold">Contracts</Label>
              {isAdmin && <AddContractDialog projectId={project.id} contractPrefixes={contractPrefixes} />}
            </div>
            {project.contracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-3 py-8 rounded-lg border border-dashed border-border">
                <ScrollText className="w-8 h-8 text-muted-foreground opacity-50" strokeWidth={1.5} />
                <p className="text-[12px] text-muted-foreground">No contracts added yet.</p>
              </div>
            ) : (
              <ContractList contracts={project.contracts} isAdmin={isAdmin} projectId={project.id} />
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
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={confirmText !== project.name || deleting}>
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

function ContractList({ contracts, isAdmin, projectId }: { contracts: Contract[]; isAdmin: boolean; projectId: string }) {
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete(contractId: string) {
    if (!confirm("Delete this contract? This cannot be undone.")) return;
    setDeletingId(contractId);
    try {
      await deleteContract(contractId);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleLatePayment(contractId: string) {
    setTogglingId(contractId);
    try {
      await toggleLatePayment(contractId);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <div className="space-y-2">
        {contracts.map((contract) => (
          <div
            key={contract.id}
            className={`rounded-lg border bg-card p-4 flex items-center justify-between gap-3 ${
              contract.latePayment ? "border-amber-500/30 bg-amber-500/5" : "border-border"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ContractBadge contract={contract} />
              {contract.latePayment && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">
                  <AlertTriangle className="w-3 h-3" />
                  Late Payment
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleLatePayment(contract.id)}
                  disabled={togglingId === contract.id}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    contract.latePayment
                      ? "text-amber-400 hover:bg-amber-500/10"
                      : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
                  }`}
                  title={contract.latePayment ? "Remove late payment flag" : "Mark as late payment"}
                >
                  {togglingId === contract.id
                    ? "..."
                    : contract.latePayment
                      ? "Unmark Late"
                      : "Late Payment"}
                </button>
                <button
                  onClick={() => setEditingContract(contract)}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Edit contract"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(contract.id)}
                  disabled={deletingId === contract.id}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  title="Delete contract"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingContract && (
        <EditContractDialog
          contract={editingContract}
          open={!!editingContract}
          onClose={() => setEditingContract(null)}
        />
      )}
    </>
  );
}
