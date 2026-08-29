"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Loader2, X as XIcon, ScrollText, AlertTriangle, Archive, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteProject, updateProject, deleteContract, toggleLatePayment, setProjectClientChat } from "@/actions/project";
import { getRoles } from "@/actions/role";
import { getArchivedTasks, restoreTask, permanentlyDeleteTask } from "@/actions/task";
import { ContractBadge } from "@/components/project/contract-badge";
import { AddContractDialog } from "@/components/project/add-contract-dialog";
import { EditContractDialog } from "@/components/project/edit-contract-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { stageLabel, outlineBadge } from "@/lib/task-label";
import { usePasteFiles } from "@/hooks/use-paste-files";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { ClientChatPeopleManager } from "@/components/messages/client-chat-people";

interface Team {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  label: string | null;
  code: string | null;
  prefixId?: string | null;
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

interface ClientMember {
  id: string;
  name: string | null;
  imageUrl: string | null;
}

interface ProjectSettingsProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    logoUrl: string | null;
    team?: Team | null;
    contracts: Contract[];
    defaultClientReviewerId?: string | null;
    internalReviewRoleId?: string | null;
    internalReviewUserId?: string | null;
    clientChatEnabled?: boolean;
  };
  teams?: Team[];
  contractPrefixes?: ContractPrefixOption[];
  clientMembers?: ClientMember[];
  /** Non-client project members for the internal review user picker. */
  internalMembers?: ClientMember[];
  isAdmin?: boolean;
  onClose: () => void;
}

export function ProjectSettingsOverlay({
  project,
  teams = [],
  contractPrefixes = [],
  clientMembers = [],
  internalMembers = [],
  isAdmin = false,
  onClose,
}: ProjectSettingsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(project.name);
  const [logo, setLogo] = useState<string | null>(project.logoUrl);
  const [description, setDescription] = useState(project.description || "");
  const [teamId, setTeamId] = useState(project.team?.id || "");
  const [clientReviewerId, setClientReviewerId] = useState(project.defaultClientReviewerId || "");
  const [internalReviewRoleId, setInternalReviewRoleId] = useState(project.internalReviewRoleId || "");
  const [internalReviewUserId, setInternalReviewUserId] = useState(project.internalReviewUserId || "");
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [clientChatEnabled, setClientChatEnabled] = useState(!!project.clientChatEnabled);
  const [clientChatSaving, setClientChatSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"general" | "archive">("general");
  useScrollLock(true);

  useEffect(() => {
    void getRoles()
      .then((rows) =>
        setRoles(
          rows
            .filter((r) => !r.isClient)
            .map((r) => ({ id: r.id, name: r.name })),
        ),
      )
      .catch(() => {});
  }, []);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadLogo(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 512 * 1024) {
      alert("Logo must be under 512KB");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadFileToR2(file);
      await updateProject({ projectId: project.id, logoUrl: url });
      setLogo(url);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  const logoPasteRef = usePasteFiles(
    (files) => {
      const image = files.find((f) => f.type.startsWith("image/"));
      if (image) void uploadLogo(image);
    },
    { enabled: !uploading, capture: false },
  );

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
    setSaveError(null);
    try {
      await updateProject({
        projectId: project.id,
        name: name.trim(),
        description,
        // Empty string = "No team" — send null so the team can be cleared.
        teamId: teamId || null,
        defaultClientReviewerId: clientReviewerId || null,
        internalReviewRoleId: internalReviewUserId ? null : (internalReviewRoleId || null),
        internalReviewUserId: internalReviewUserId || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Refresh server components so the page reflects the change right away.
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes");
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
    <div data-scroll-lock-root className="fixed inset-0 z-[9999] flex flex-col bg-background">
      <div className="flex app-top-bar items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-xs text-muted-foreground hover:text-foreground transition-colors text-s">
            <XIcon className="w-4 h-4" />
            Close
          </button>
          <span className="text-border">|</span>
          <span className="text-s font-semibold">{name || project.name} — Settings</span>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("general")}
              className={cn("px-3 py-1 rounded-md text-s font-medium transition-colors", activeTab === "general" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab("archive")}
              className={cn("px-3 py-1 rounded-md text-s font-medium transition-colors flex items-center gap-xs", activeTab === "archive" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
          </div>
        </div>
        {activeTab === "general" && (
          <div className="flex items-center gap-3">
            {saveError && (
              <span className="text-s text-destructive">{saveError}</span>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : null}
              {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {activeTab === "archive" ? (
          <ArchiveTab projectId={project.id} isAdmin={isAdmin} />
        ) : (
        <div className="max-w-2xl mx-auto py-10 px-app space-y-10">

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="proj-name" className="text-s font-semibold">Project Name</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="text-s"
            />
          </div>

          {/* Logo */}
          <div ref={logoPasteRef} className="space-y-3">
            <Label className="text-s font-semibold">Project Photo</Label>
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
                  <span className="text-m font-bold text-muted-foreground">{project.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="cursor-pointer">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  <span className="inline-flex items-center gap-xs px-3 py-1.5 rounded-md border border-border text-s font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Uploading..." : logo ? "Change" : "Upload"}
                  </span>
                </label>
                <p className="text-xs text-muted-foreground/50">Square, max 512KB</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="proj-desc" className="text-s font-semibold">Description</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief project description..."
              rows={4}
              className="text-s"
            />
          </div>

          {/* Team */}
          <div className="space-y-2">
            <Label htmlFor="proj-team" className="text-s font-semibold">Team</Label>
            {teams.length === 0 ? (
              <p className="text-s text-muted-foreground">
                No teams yet. Create one in{" "}
                <a href="/dashboard/settings" className="text-primary underline">Settings</a>.
              </p>
            ) : (
              <select
                id="proj-team"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-s text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-internal-review" className="text-s font-semibold">Internal Review assignment</Label>
            <p className="text-xs text-muted-foreground">
              Tasks moved to Internal Review are auto-assigned to this person or a member with this role.
            </p>
            <select
              id="proj-internal-review"
              value={internalReviewUserId ? `user:${internalReviewUserId}` : internalReviewRoleId ? `role:${internalReviewRoleId}` : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("user:")) {
                  setInternalReviewUserId(v.slice(5));
                  setInternalReviewRoleId("");
                } else if (v.startsWith("role:")) {
                  setInternalReviewUserId("");
                  setInternalReviewRoleId(v.slice(5));
                } else {
                  setInternalReviewUserId("");
                  setInternalReviewRoleId("");
                }
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-s text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Task creator (default)</option>
              {roles.length > 0 && (
                <optgroup label="By role">
                  {roles.map((role) => (
                    <option key={role.id} value={`role:${role.id}`}>{role.name}</option>
                  ))}
                </optgroup>
              )}
              {internalMembers.length > 0 && (
                <optgroup label="Specific person">
                  {internalMembers.map((m) => (
                    <option key={m.id} value={`user:${m.id}`}>{m.name ?? m.id}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Default Client Reviewer */}
          <div className="space-y-2">
            <Label htmlFor="proj-client" className="text-s font-semibold">Default Client Reviewer</Label>
            <p className="text-xs text-muted-foreground">
              Tasks in Client Review will be auto-assigned to this person.
            </p>
            {clientMembers.length === 0 ? (
              <p className="text-s text-muted-foreground">
                No client members in this project yet.
              </p>
            ) : (
              <select
                id="proj-client"
                value={clientReviewerId}
                onChange={(e) => setClientReviewerId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-s text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Auto (first client member)</option>
                {clientMembers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name ?? c.id}</option>
                ))}
              </select>
            )}
          </div>

          {/* Client chat */}
          <div className="space-y-2 rounded-md border border-border/60 bg-surface/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="proj-client-chat" className="text-s font-semibold">
                  Enable client chat
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Opens a separate chat room for clients — isolated from internal project chat.
                  Clients on the project join automatically; add staff from your side below.
                </p>
              </div>
              <button
                id="proj-client-chat"
                type="button"
                role="switch"
                aria-checked={clientChatEnabled}
                disabled={clientChatSaving}
                onClick={async () => {
                  const next = !clientChatEnabled;
                  setClientChatSaving(true);
                  setSaveError(null);
                  try {
                    await setProjectClientChat({
                      projectId: project.id,
                      enabled: next,
                    });
                    setClientChatEnabled(next);
                    router.refresh();
                  } catch (err) {
                    setSaveError(
                      err instanceof Error ? err.message : "Failed to update client chat",
                    );
                  } finally {
                    setClientChatSaving(false);
                  }
                }}
                className={cn(
                  "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
                  clientChatEnabled ? "bg-primary" : "bg-muted",
                  clientChatSaving && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                    clientChatEnabled && "translate-x-5",
                  )}
                />
              </button>
            </div>
            {clientChatSaving && (
              <p className="flex items-center gap-xs text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating…
              </p>
            )}
            {clientChatEnabled && (
              <ClientChatPeopleManager projectId={project.id} enabled />
            )}
          </div>

          {/* Contracts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-s font-semibold">Contracts</Label>
              {isAdmin && <AddContractDialog projectId={project.id} contractPrefixes={contractPrefixes} />}
            </div>
            {project.contracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-3 py-8 rounded-lg border border-dashed border-border">
                <ScrollText className="w-8 h-8 text-muted-foreground opacity-50" strokeWidth={1.5} />
                <p className="text-s text-muted-foreground">No contracts added yet.</p>
              </div>
            ) : (
              <ContractList contracts={project.contracts} isAdmin={isAdmin} projectId={project.id} contractPrefixes={contractPrefixes} />
            )}
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
            <div>
              <h3 className="text-s font-semibold text-destructive">Danger Zone</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete this project and all its data. This cannot be undone.
              </p>
            </div>
            {!deleteOpen ? (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-3.5 h-3.5 me-1.5" />
                Delete Project
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-s text-muted-foreground">
                  Type <strong className="text-foreground">{project.name}</strong> to confirm:
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={project.name}
                  className="text-s"
                  autoFocus
                />
                {deleteError && <p className="text-s text-destructive">{deleteError}</p>}
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={confirmText !== project.name || deleting}>
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin me-1" /> : <Trash2 className="w-3 h-3 me-1" />}
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
        )}
      </div>
    </div>
  );
}

function ContractList({ contracts, isAdmin, projectId, contractPrefixes = [] }: { contracts: Contract[]; isAdmin: boolean; projectId: string; contractPrefixes?: ContractPrefixOption[] }) {
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
              contract.latePayment ? "border-orange/30 bg-orange/5" : "border-border"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ContractBadge contract={contract} />
              {contract.latePayment && (
                <StatusBadge config={outlineBadge("Late Payment", "text-orange", "border-orange/30")} icon={AlertTriangle} className="shrink-0" />
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleLatePayment(contract.id)}
                  disabled={togglingId === contract.id}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    contract.latePayment
                      ? "text-orange hover:bg-orange/10"
                      : "text-muted-foreground hover:text-orange hover:bg-orange/10"
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
          contractPrefixes={contractPrefixes}
          open={!!editingContract}
          onClose={() => setEditingContract(null)}
        />
      )}
    </>
  );
}

/* ─── Archive Tab ─── */

const TASK_TYPE_META: Record<string, { prefix: string; color: string }> = {
  FEATURE: { prefix: "F", color: "text-primary" },
  ENHANCEMENT: { prefix: "E", color: "text-violet" },
  BUG: { prefix: "B", color: "text-orange" },
  REPORTED_BUG: { prefix: "RB", color: "text-destructive" },
  DESIGN: { prefix: "D", color: "text-cyan" },
};

interface ArchivedTask {
  id: string;
  taskNumber: number;
  title: string;
  taskType: string;
  stage: string;
  priority: number | null;
  archivedAt: Date | null;
  createdBy: { id: string; name: string | null; imageUrl: string | null };
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
}

function ArchiveTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [tasks, setTasks] = useState<ArchivedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    getArchivedTasks(projectId)
      .then((data) => setTasks(data as ArchivedTask[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleRestore(taskId: string) {
    setActionId(taskId);
    try {
      await restoreTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  }

  async function handlePermanentDelete(taskId: string) {
    setActionId(taskId);
    try {
      await permanentlyDeleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-app">
      <div className="mb-6">
        <h2 className="text-s font-semibold flex items-center gap-2">
          <Archive className="w-4 h-4 text-muted-foreground" />
          Archived Tasks
        </h2>
        <p className="text-s text-muted-foreground mt-1">
          Deleted tasks are moved here. {isAdmin ? "Admins can restore or permanently delete them." : "Ask an admin to restore or permanently delete them."}
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-16 rounded-lg border border-dashed border-border">
          <Archive className="w-10 h-10 text-muted-foreground opacity-30" strokeWidth={1.5} />
          <p className="text-s text-muted-foreground">No archived tasks</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const meta = TASK_TYPE_META[task.taskType] ?? { prefix: "?", color: "text-muted-foreground" };
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 group"
              >
                <span className={cn("text-s font-mono font-bold shrink-0", meta.color)}>
                  {meta.prefix}-{String(task.taskNumber).padStart(3, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-s font-medium truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {stageLabel(task.stage)}
                    </span>
                    {task.priority && (
                      <span className="text-xs text-muted-foreground">
                        P{task.priority}
                      </span>
                    )}
                    {task.archivedAt && (
                      <span className="text-xs text-muted-foreground/50">
                        Archived {new Date(task.archivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {confirmDeleteId === task.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handlePermanentDelete(task.id)}
                          disabled={actionId === task.id}
                          className="text-xs h-7"
                        >
                          {actionId === task.id ? <Loader2 className="w-3 h-3 animate-spin me-1" /> : <Trash2 className="w-3 h-3 me-1" />}
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs h-7"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRestore(task.id)}
                          disabled={actionId === task.id}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                          title="Restore task"
                        >
                          {actionId === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                          Restore
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(task.id)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
