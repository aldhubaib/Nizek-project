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
import { Trash2, Shield, RefreshCw, X, Clock, Mail, UserPlus, Users, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { removeMember, updateMemberRole, resendInvitation, cancelInvitation, updateMemberInvitePerms } from "@/actions/project";

interface WorkspaceRole {
  id: string;
  name: string;
  isAdmin: boolean;
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
  canInviteClients: boolean;
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
}: Props) {
  const isAdmin = currentUserRole === "ADMIN" || canManageMembers;
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [transferState, setTransferState] = useState<TransferState | null>(null);
  const [removing, setRemoving] = useState(false);

  async function handleRoleChange(memberId: string, roleId: string) {
    try {
      await updateMemberRole({ projectId, memberId, roleId });
    } catch (err) {
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
    } catch (err) {
      alert((err as Error).message || "Failed to transfer tasks");
    } finally {
      setRemoving(false);
    }
  }

  async function handleResend(invitationId: string) {
    setResendingId(invitationId);
    try {
      await resendInvitation({ projectId, invitationId });
    } catch (err) {
      console.error(err);
    } finally {
      setResendingId(null);
    }
  }

  async function handleCancelInvite(invitationId: string) {
    try {
      await cancelInvitation({ projectId, invitationId });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggleInvitePerm(memberId: string, field: "canInviteMembers" | "canInviteClients", value: boolean) {
    try {
      await updateMemberInvitePerms({ projectId, memberId, [field]: value });
    } catch (err) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
          const roleName = member.projectRole?.name ?? member.role;

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
                    <p className="text-s font-medium text-foreground truncate">
                      {member.user.name ?? member.user.email}
                      {isSelf && (
                        <span className="ms-1 text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
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
                  value={member.roleId ?? ""}
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
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  <Shield className="w-3 h-3" strokeWidth={1.5} />
                  {roleName}
                </span>
              )}

              {isAdmin && !isSelf && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                  <InviteToggle
                    checked={member.canInviteMembers}
                    onChange={(v) => handleToggleInvitePerm(member.id, "canInviteMembers", v)}
                    icon={<Users className="w-3 h-3" strokeWidth={1.5} />}
                    label="Members"
                  />
                  <InviteToggle
                    checked={member.canInviteClients}
                    onChange={(v) => handleToggleInvitePerm(member.id, "canInviteClients", v)}
                    icon={<UserPlus className="w-3 h-3" strokeWidth={1.5} />}
                    label="Clients"
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
              Pending Invitations
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {invitations.map((inv) => {
              const expired = isExpired(inv);
              const roleName = inv.projectRole?.name ?? inv.role;

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
                        <p className="text-s font-medium text-muted-foreground truncate">
                          {inv.email}
                        </p>
                        <div className="flex items-center gap-xs mt-0.5">
                          {expired ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive border border-destructive/20 px-1.5 py-0.5 text-xs font-semibold">
                              Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange/15 text-orange border border-orange/20 px-1.5 py-0.5 text-xs font-semibold">
                              <Clock className="w-2.5 h-2.5" />
                              Waiting
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground/50">
                            {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleCancelInvite(inv.id)}
                        title="Cancel invitation"
                        className="text-muted-foreground/40 hover:text-destructive shrink-0 -mt-0.5 -me-1"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                      <Shield className="w-3 h-3" strokeWidth={1.5} />
                      {roleName}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(inv.id)}
                        disabled={resendingId === inv.id}
                        className="text-xs text-muted-foreground hover:text-foreground h-6 px-2"
                      >
                        <RefreshCw className={`w-3 h-3 me-1 ${resendingId === inv.id ? "animate-spin" : ""}`} strokeWidth={1.5} />
                        Resend
                      </Button>
                    )}
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
