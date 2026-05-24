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
import { Trash2, Shield, RefreshCw, X, Clock, Mail } from "lucide-react";
import { removeMember, updateMemberRole, resendInvitation, cancelInvitation } from "@/actions/project";

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

  async function handleRoleChange(memberId: string, roleId: string) {
    try {
      await updateMemberRole({ projectId, memberId, roleId });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Remove this member from the project?")) return;
    try {
      await removeMember({ projectId, memberId });
    } catch (err) {
      alert((err as Error).message || "Failed to remove member");
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

  const isExpired = (inv: Invitation) => new Date(inv.expiresAt) < new Date();

  return (
    <div className="space-y-6">
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
                <div className="flex items-center gap-2.5 min-w-0">
                  {member.user.imageUrl ? (
                    <img
                      src={member.user.imageUrl}
                      alt={member.user.name ?? ""}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-[12px] font-semibold text-primary shrink-0">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {member.user.name ?? member.user.email}
                      {isSelf && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {member.user.email}
                    </p>
                  </div>
                </div>
                {isAdmin && !isSelf && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemove(member.id)}
                    className="text-muted-foreground/40 hover:text-destructive shrink-0 -mt-0.5 -mr-1"
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
                  <SelectTrigger className="h-7 w-full text-[11px] rounded-full border-border">
                    <SelectValue placeholder="Assign role">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                        {roleName}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                          {r.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  <Shield className="w-3 h-3" strokeWidth={1.5} />
                  {roleName}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {invitations.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="text-[11px] font-medium text-muted-foreground/70">
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
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">
                        <Mail className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-muted-foreground truncate">
                          {inv.email}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {expired ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive border border-destructive/20 px-1.5 py-0.5 text-[9px] font-semibold">
                              Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold">
                              <Clock className="w-2.5 h-2.5" />
                              Waiting
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/50">
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
                        className="text-muted-foreground/40 hover:text-destructive shrink-0 -mt-0.5 -mr-1"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      <Shield className="w-3 h-3" strokeWidth={1.5} />
                      {roleName}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(inv.id)}
                        disabled={resendingId === inv.id}
                        className="text-[10px] text-muted-foreground hover:text-foreground h-6 px-2"
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${resendingId === inv.id ? "animate-spin" : ""}`} strokeWidth={1.5} />
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
