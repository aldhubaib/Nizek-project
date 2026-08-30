"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Shield, X, Clock, Mail, Users, AlertTriangle, ArrowRightLeft, Film, Eye, Pencil } from "lucide-react";
import { removeMember, updateMemberRole, cancelInvitation, updateMemberInvitePerms, updateInvitationName, updateMemberName } from "@/actions/project";
import { startImpersonationByEmail } from "@/actions/impersonation";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";

interface WorkspaceRole {
  id: string;
  name: string;
  isAdmin: boolean;
  isClient?: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
}

interface Member {
  id: string;
  role: string;
  roleId: string | null;
  projectRole: WorkspaceRole | null;
  canInviteMembers: boolean;
  canBypassProof: boolean;
  user: {
    id: string;
    name: string | null;
    email: string;
    imageUrl: string | null;
  };
}

interface Invitation {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  invitedBy: { id: string; name: string | null; imageUrl: string | null };
  projectRole: { id: string; name: string; isAdmin: boolean } | null;
}

interface Props {
  members: Member[];
  projectId: string;
  currentUserRole: string;
  currentUserId: string;
  roles: WorkspaceRole[];
  invitations?: Invitation[];
  canManageMembers?: boolean;
  onTeamChanged?: () => void;
  canImpersonate?: boolean;
}

interface TransferState {
  memberId: string;
  memberName: string;
  taskCount: number;
  transferToUserId: string;
}

export function MemberList({
  members,
  projectId,
  currentUserRole,
  currentUserId,
  roles,
  invitations = [],
  canManageMembers = false,
  onTeamChanged,
  canImpersonate = false,
}: Props) {
  const isAdmin = currentUserRole === "ADMIN" || canManageMembers;
  const [transferState, setTransferState] = useState<TransferState | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [permOverrides, setPermOverrides] = useState<
    Record<string, Partial<Pick<Member, "canInviteMembers" | "canBypassProof">>>
  >({});
  const [roleOverrides, setRoleOverrides] = useState<Record<string, string>>({});
  const [nameEdit, setNameEdit] = useState<{
    kind: "member" | "invitation";
    id: string;
    value: string;
    error: string | null;
    saving: boolean;
  } | null>(null);

  async function handleRoleChange(memberId: string, roleId: string) {
    setRoleOverrides((prev) => ({ ...prev, [memberId]: roleId }));
    try {
      await updateMemberRole({ projectId, memberId, roleId });
      onTeamChanged?.();
    } catch (err) {
      setRoleOverrides((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      console.error(err);
    }
  }

  async function handleRemove(memberId: string) {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    setRemoving(true);
    try {
      const result = await removeMember({ projectId, memberId });
      if (!result.success) {
        const match = result.error.match(/^TRANSFER_REQUIRED:(\d+)$/);
        if (match) {
          setTransferState({
            memberId,
            memberName: member.user.name ?? member.user.email,
            taskCount: parseInt(match[1], 10),
            transferToUserId: "",
          });
        } else {
          alert(result.error || "Failed to remove member");
        }
      } else {
        onTeamChanged?.();
      }
    } catch (err) {
      alert((err as Error).message || "Failed to remove member");
    } finally {
      setRemoving(false);
    }
  }

  async function handleTransferAndRemove() {
    if (!transferState || !transferState.transferToUserId) return;
    setRemoving(true);
    try {
      const result = await removeMember({
        projectId,
        memberId: transferState.memberId,
        transferToUserId: transferState.transferToUserId,
      });
      if (!result.success) {
        alert(result.error || "Failed to transfer tasks");
        return;
      }
      setTransferState(null);
      onTeamChanged?.();
    } catch (err) {
      alert((err as Error).message || "Failed to transfer tasks");
    } finally {
      setRemoving(false);
    }
  }

  async function handleSignInAsEmail(email: string) {
    setImpersonating(email);
    try {
      const res = await startImpersonationByEmail(email);
      if (res?.error) {
        alert(res.error);
        setImpersonating(null);
        return;
      }
      window.location.href = res.redirectTo ?? "/dashboard";
    } catch (err) {
      alert((err as Error).message || "Failed to sign in as user");
      setImpersonating(null);
    }
  }

  async function handleCancelInvite(invitationId: string) {
    try {
      await cancelInvitation({ projectId, invitationId });
      onTeamChanged?.();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleNameSave() {
    if (!nameEdit || nameEdit.saving) return;
    const trimmed = nameEdit.value.trim();
    if (!trimmed) {
      setNameEdit({ ...nameEdit, error: "Name is required" });
      return;
    }
    setNameEdit({ ...nameEdit, error: null, saving: true });
    try {
      const res =
        nameEdit.kind === "member"
          ? await updateMemberName({ projectId, memberId: nameEdit.id, name: trimmed })
          : await updateInvitationName({ projectId, invitationId: nameEdit.id, name: trimmed });
      if (res && "error" in res && res.error) {
        setNameEdit({ ...nameEdit, error: res.error, saving: false });
        return;
      }
      setNameEdit(null);
      onTeamChanged?.();
    } catch (err) {
      setNameEdit({
        ...nameEdit,
        error: (err as Error).message || "Failed to update name",
        saving: false,
      });
    }
  }

  async function handleToggleInvitePerm(memberId: string, field: "canInviteMembers" | "canBypassProof", value: boolean) {
    setPermOverrides((prev) => ({ ...prev, [memberId]: { ...prev[memberId], [field]: value } }));
    try {
      await updateMemberInvitePerms({ projectId, memberId, [field]: value });
    } catch (err) {
      setPermOverrides((prev) => ({ ...prev, [memberId]: { ...prev[memberId], [field]: !value } }));
      console.error(err);
    }
  }

  const isExpired = (inv: Invitation) => new Date(inv.expiresAt) < new Date();

  const transferCandidates = transferState
    ? members.filter((m) => m.id !== transferState.memberId)
    : [];

  return (
    <div className="space-y-6">
      {transferState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange" />
              </div>
              <div>
                <h3 className="text-s font-semibold text-foreground">Transfer Tasks Required</h3>
                <p className="text-s text-muted-foreground mt-0.5">
                  <strong>{transferState.memberName}</strong> has{" "}
                  <strong>{transferState.taskCount}</strong> task{transferState.taskCount !== 1 ? "s" : ""} in this project.
                  Select a member to transfer them to before removal.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Transfer tasks to</label>
              <Select
                value={transferState.transferToUserId}
                onValueChange={(val) => setTransferState((s) => s ? { ...s, transferToUserId: val ?? "" } : s)}
              >
                <SelectTrigger className="h-9 text-s">
                  <SelectValue placeholder="Select a member..." />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((m) => (
                    <SelectItem key={m.id} value={m.user.id}>
                      <span className="flex items-center gap-2">
                        <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                        {m.user.name ?? m.user.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTransferState(null)}
                disabled={removing}
                className="text-s"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleTransferAndRemove}
                disabled={!transferState.transferToUserId || removing}
                className="text-s bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {removing ? "Transferring..." : "Transfer & Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {members.map((member) => {
          const initials =
            member.user.name
              ?.split(" ")
              .map((n) => n[0])
              .join("") ?? member.user.email[0]?.toUpperCase();
          const isSelf = member.user.id === currentUserId;
          const effectiveRoleId = roleOverrides[member.id] ?? member.roleId;
          const selectedRole = roles.find((r) => r.id === effectiveRoleId);
          const roleName = selectedRole?.name ?? member.projectRole?.name ?? member.role;
          const isClientRole = selectedRole
            ? selectedRole.isClient === true || selectedRole.name.toLowerCase() === "client"
            : member.role === "CLIENT" ||
              member.projectRole?.isClient === true ||
              roleName.toLowerCase() === "client";

          return (
            <div
              key={member.id}
              className="rounded-lg bg-card border border-border p-4 hover:border-muted-foreground/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-s min-w-0">
                  {member.user.imageUrl ? (
                    <img
                      src={member.user.imageUrl}
                      alt={member.user.name ?? ""}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-s font-semibold text-primary shrink-0">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    {nameEdit?.kind === "member" && nameEdit.id === member.id ? (
                      <NameEditRow
                        value={nameEdit.value}
                        saving={nameEdit.saving}
                        error={nameEdit.error}
                        onChange={(value) => setNameEdit({ ...nameEdit, value, error: null })}
                        onSave={handleNameSave}
                        onCancel={() => setNameEdit(null)}
                      />
                    ) : (
                      <p className="text-s font-medium text-foreground truncate flex items-center gap-1">
                        <span className="truncate">
                          {member.user.name ?? member.user.email}
                          {isSelf && (
                            <span className="ms-1 text-xs text-muted-foreground">(you)</span>
                          )}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() =>
                              setNameEdit({
                                kind: "member",
                                id: member.id,
                                value: member.user.name ?? "",
                                error: null,
                                saving: false,
                              })
                            }
                            title="Edit name"
                            className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {member.user.email}
                    </p>
                  </div>
                </div>
                {isAdmin && !isSelf && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemove(member.id)}
                    className="text-muted-foreground/40 hover:text-destructive shrink-0 -mt-0.5 -me-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </Button>
                )}
              </div>

              {isAdmin && !isSelf ? (
                <Select
                  value={effectiveRoleId ?? ""}
                  onValueChange={(val) => val && handleRoleChange(member.id, val)}
                >
                  <SelectTrigger className="h-7 w-full text-xs rounded-full border-border">
                    <SelectValue placeholder="Assign role">
                      <span className="flex items-center gap-xs">
                        <Shield className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                        {roleName}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex items-center gap-xs">
                          <Shield className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                          {r.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <StatusBadge config={outlineBadge(roleName, "text-muted-foreground", "border-border")} icon={Shield} />
              )}

              {isAdmin && !isSelf && !isClientRole && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                  <InviteToggle
                    checked={permOverrides[member.id]?.canInviteMembers ?? member.canInviteMembers}
                    onChange={(v) => handleToggleInvitePerm(member.id, "canInviteMembers", v)}
                    icon={<Users className="w-3 h-3" strokeWidth={1.5} />}
                    label="Members"
                  />
                  <InviteToggle
                    checked={permOverrides[member.id]?.canBypassProof ?? member.canBypassProof}
                    onChange={(v) => handleToggleInvitePerm(member.id, "canBypassProof", v)}
                    icon={<Film className="w-3 h-3" strokeWidth={1.5} />}
                    label="Bypass"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {invitations.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="text-xs font-medium text-muted-foreground/70">
              Awaiting Sign In
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {invitations.map((inv) => {
              const expired = isExpired(inv);
              const roleName = inv.projectRole?.name ?? inv.role;
              const displayName = inv.name?.trim() || inv.email;

              return (
                <div
                  key={inv.id}
                  className="rounded-lg bg-card border border-dashed border-border p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-s min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">
                        <Mail className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        {nameEdit?.kind === "invitation" && nameEdit.id === inv.id ? (
                          <NameEditRow
                            value={nameEdit.value}
                            saving={nameEdit.saving}
                            error={nameEdit.error}
                            onChange={(value) => setNameEdit({ ...nameEdit, value, error: null })}
                            onSave={handleNameSave}
                            onCancel={() => setNameEdit(null)}
                          />
                        ) : (
                          <p className="text-s font-medium text-foreground truncate flex items-center gap-1">
                            <span className="truncate">{displayName}</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  setNameEdit({
                                    kind: "invitation",
                                    id: inv.id,
                                    value: inv.name ?? "",
                                    error: null,
                                    saving: false,
                                  })
                                }
                                title="Edit name"
                                className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </p>
                        )}
                        {inv.name?.trim() && (
                          <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
                        )}
                        <div className="flex items-center gap-xs mt-0.5">
                          {expired ? (
                            <StatusBadge config={outlineBadge("Expired", "text-destructive", "border-destructive/30")} />
                          ) : (
                            <StatusBadge config={outlineBadge("Added", "text-orange", "border-orange/30")} icon={Clock} />
                          )}
                          <span className="text-xs text-muted-foreground/50">
                            {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 -mt-0.5 -me-1">
                      {canImpersonate && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleSignInAsEmail(inv.email)}
                          disabled={impersonating === inv.email}
                          title={`Sign in as ${inv.email}`}
                          className="text-muted-foreground/40 hover:text-foreground"
                        >
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCancelInvite(inv.id)}
                          title="Remove from allowlist"
                          className="text-muted-foreground/40 hover:text-destructive"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <StatusBadge config={outlineBadge(roleName, "text-muted-foreground", "border-border")} icon={Shield} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NameEditRow({
  value,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-1"
    >
      <div className="flex items-center gap-xs">
        <input
          type="text"
          value={value}
          autoFocus
          disabled={saving}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          placeholder="Full name"
          className="h-6 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-muted-foreground/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={saving}
          className="h-6 px-2 rounded-md text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50 shrink-0"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-6 px-2 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50 shrink-0"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

function InviteToggle({ checked, onChange, icon, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-xs group/toggle"
    >
      <div className={`w-6 h-3.5 rounded-full transition-colors relative ${checked ? "bg-primary/70" : "bg-muted"}`}>
        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${checked ? "left-3 bg-white" : "left-0.5 bg-muted-foreground/40"}`} />
      </div>
      <span className="text-xs text-muted-foreground group-hover/toggle:text-foreground transition-colors flex items-center gap-0.5">
        {icon}
        {label}
      </span>
    </button>
  );
}
