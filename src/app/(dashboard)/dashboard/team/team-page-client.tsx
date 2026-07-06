"use client";

import { useState } from "react";
import { Users, Mail, Clock, FolderKanban, Search, UserPlus, X, Ban, RotateCw, Trash2, ShieldCheck, Shield, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { updateUserAdmin, inviteToTeam, toggleBlockUser, cancelTeamInvite, resendTeamInvite, getUserTaskSummary } from "@/actions/team";

interface MemberProject {
  id: string;
  name: string;
  role: string;
  roleName: string;
}

interface Member {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  systemRole: string;
  blocked: boolean;
  createdAt: Date;
  projects: MemberProject[];
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  project: { id: string; name: string };
  invitedBy: { id: string; name: string | null; imageUrl: string | null };
  projectRole: { id: string; name: string } | null;
}

interface TeamInvite {
  id: string;
  email: string;
  systemRole: string;
  createdAt: Date;
}

interface GlobalRole {
  id: string;
  name: string;
  isAdmin: boolean;
  _count: { members: number };
}

interface Props {
  members: Member[];
  invitations: Invitation[];
  teamInvites: TeamInvite[];
  roles: GlobalRole[];
  isAdmin: boolean;
}

export function TeamPageClient({ members, invitations, teamInvites, roles, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteIsAdmin, setInviteIsAdmin] = useState(false);
  const [inviting, setInviting] = useState(false);

  async function handleAdminToggle(userId: string, makeAdmin: boolean) {
    setChangingRole(userId);
    try {
      await updateUserAdmin(userId, makeAdmin);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setChangingRole(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteFirstName.trim() || !inviteLastName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteToTeam({
        email: inviteEmail.trim(),
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
        systemRole: inviteIsAdmin ? "ADMIN" : "DEVELOPER",
      });
      setShowInvite(false);
      setInviteFirstName("");
      setInviteLastName("");
      setInviteEmail("");
      setInviteIsAdmin(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setInviting(false);
    }
  }

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  interface ProjectTransfer {
    id: string;
    name: string;
    taskCount: number;
    eligibleTransferTargets: { id: string; name: string | null; imageUrl: string | null; systemRole: string }[];
    transferToUserId: string;
  }

  const [blockTransfer, setBlockTransfer] = useState<{
    userId: string;
    userName: string;
    projects: ProjectTransfer[];
  } | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);

  async function handleBlock(userId: string) {
    const member = members.find((m) => m.id === userId);
    if (!member) return;

    if (member.blocked) {
      if (!confirm("Unblock this user?")) return;
      setActionLoading(userId);
      try {
        await toggleBlockUser(userId);
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setActionLoading(null);
      }
      return;
    }

    setActionLoading(userId);
    try {
      await toggleBlockUser(userId);
    } catch (err) {
      const msg = (err as Error).message || "";
      if (msg === "TRANSFER_REQUIRED") {
        try {
          const summary = await getUserTaskSummary(userId);
          if (summary.length > 0) {
            setBlockTransfer({
              userId,
              userName: member.name ?? member.email,
              projects: summary.map((p) => ({
                ...p,
                transferToUserId: "",
              })),
            });
          }
        } catch (fetchErr) {
          alert((fetchErr as Error).message || "Failed to load task summary");
        }
      } else {
        alert(msg);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBlockWithTransfer() {
    if (!blockTransfer) return;
    const allSelected = blockTransfer.projects.every((p) => p.transferToUserId);
    if (!allSelected) {
      alert("Please select a transfer target for every project.");
      return;
    }

    setBlockLoading(true);
    try {
      await toggleBlockUser(
        blockTransfer.userId,
        blockTransfer.projects.map((p) => ({
          projectId: p.id,
          transferToUserId: p.transferToUserId,
        })),
      );
      setBlockTransfer(null);
    } catch (err) {
      alert((err as Error).message || "Failed to block user");
    } finally {
      setBlockLoading(false);
    }
  }

  async function handleResendInvite(inviteId: string) {
    setActionLoading(inviteId);
    try {
      await resendTeamInvite(inviteId);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!confirm("Cancel this invitation?")) return;
    setActionLoading(inviteId);
    try {
      await cancelTeamInvite(inviteId);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const filteredMembers = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredInvitations = invitations.filter((inv) =>
    inv.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTeamInvites = teamInvites.filter((inv) =>
    inv.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = invitations.length + teamInvites.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
          </div>
          {totalPending > 0 && (
            <div className="flex items-center gap-2 text-[13px] text-amber-400">
              <Mail className="w-4 h-4" />
              <span>{totalPending} pending</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground/60">
            <Shield className="w-4 h-4" />
            <span>{roles.length} role{roles.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Invite Member
          </button>
        )}
      </div>

      {/* Invite Dialog */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-border bg-sidebar p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-foreground">Invite Member</h3>
              <button
                onClick={() => setShowInvite(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-card transition-colors text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">First name</label>
                  <input
                    type="text"
                    required
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="Jane"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Last name</label>
                  <input
                    type="text"
                    required
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setInviteIsAdmin(!inviteIsAdmin)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors w-full",
                    inviteIsAdmin
                      ? "bg-purple-500/15 border-purple-500/30 text-purple-400"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-sm border flex items-center justify-center transition-colors",
                      inviteIsAdmin ? "bg-purple-500 border-purple-500" : "border-muted-foreground/40"
                    )}
                  >
                    {inviteIsAdmin && <ShieldCheck className="w-3 h-3 text-white" strokeWidth={2.5} />}
                  </div>
                  Grant system admin access
                </button>
                <p className="text-[10px] text-muted-foreground/60 mt-1 ml-1">
                  Admins have full access. Assign project roles when adding members to projects.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:bg-card transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteFirstName.trim() || !inviteLastName.trim() || !inviteEmail.trim()}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {inviting ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Block Transfer Dialog */}
      {blockTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-foreground">Transfer Tasks Before Blocking</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  <strong>{blockTransfer.userName}</strong> has tasks across {blockTransfer.projects.length} project{blockTransfer.projects.length !== 1 ? "s" : ""}.
                  Select who should take over in each project.
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              {blockTransfer.projects.map((proj) => (
                <div key={proj.id} className="rounded-lg bg-muted/30 border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-medium text-foreground">{proj.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {proj.taskCount} task{proj.taskCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <select
                    value={proj.transferToUserId}
                    onChange={(e) => {
                      setBlockTransfer((s) => {
                        if (!s) return s;
                        return {
                          ...s,
                          projects: s.projects.map((p) =>
                            p.id === proj.id ? { ...p, transferToUserId: e.target.value } : p
                          ),
                        };
                      });
                    }}
                    className="w-full h-8 px-2 rounded-md border border-border bg-card text-[12px] text-foreground"
                  >
                    <option value="">Select transfer target...</option>
                    {proj.eligibleTransferTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name ?? t.id} ({t.systemRole})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setBlockTransfer(null)}
                disabled={blockLoading}
                className="px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBlockWithTransfer}
                disabled={blockLoading || blockTransfer.projects.some((p) => !p.transferToUserId)}
                className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-[13px] font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {blockLoading ? "Processing..." : "Transfer & Block"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* Members */}
      <div>
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Members</h2>
        <div className="space-y-1">
          {filteredMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/60 transition-colors group"
            >
              {member.imageUrl ? (
                <img src={member.imageUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
                  {(member.name?.[0] || member.email[0]).toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground truncate">
                    {member.name || member.email}
                  </span>
                  {member.systemRole === "ADMIN" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium text-purple-400 bg-purple-500/15 border-purple-500/30">
                      Admin
                    </span>
                  )}
                  {member.blocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium text-destructive bg-destructive/15 border-destructive/30">
                      Blocked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-muted-foreground truncate">{member.email}</span>
                  <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Joined {formatDistanceToNow(new Date(member.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {member.projects.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <FolderKanban className="w-3 h-3 text-muted-foreground/50" />
                    <div className="flex flex-wrap gap-1">
                      {member.projects.map((p) => (
                        <span
                          key={p.id}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-card border border-border text-muted-foreground"
                        >
                          {p.name}
                          {p.roleName && (
                            <span className="text-muted-foreground/50 ml-0.5">({p.roleName})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => handleAdminToggle(member.id, member.systemRole !== "ADMIN")}
                      disabled={changingRole === member.id}
                      title={member.systemRole === "ADMIN" ? "Remove admin" : "Make admin"}
                      className={cn(
                        "h-7 px-2.5 text-[11px] font-medium rounded-md border transition-colors disabled:opacity-50",
                        member.systemRole === "ADMIN"
                          ? "bg-purple-500/15 border-purple-500/30 text-purple-400 hover:bg-purple-500/25"
                          : "border-border text-muted-foreground hover:border-muted-foreground/40"
                      )}
                    >
                      {member.systemRole === "ADMIN" ? "Admin" : "Member"}
                    </button>
                    <button
                      onClick={() => handleBlock(member.id)}
                      disabled={actionLoading === member.id}
                      title={member.blocked ? "Unblock user" : "Block user"}
                      className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-50",
                        member.blocked
                          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                          : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      )}
                    >
                      {member.blocked ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {filteredMembers.length === 0 && (
            <p className="text-[13px] text-muted-foreground py-4 text-center">No members found.</p>
          )}
        </div>
      </div>

      {/* Pending Invitations */}
      {(filteredTeamInvites.length > 0 || filteredInvitations.length > 0) && (
        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-3">Pending Invitations</h2>
          <div className="space-y-1">
            {filteredTeamInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/60 transition-colors">
                <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground truncate block">{inv.email}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {inv.systemRole === "ADMIN" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium text-purple-400 bg-purple-500/15 border-purple-500/30">Admin</span>
                    )}
                    <span className="text-[11px] text-muted-foreground/50">
                      Invited {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleResendInvite(inv.id)} disabled={actionLoading === inv.id} title="Resend invitation"
                      className="w-7 h-7 rounded-md flex items-center justify-center bg-card border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors disabled:opacity-50">
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleCancelInvite(inv.id)} disabled={actionLoading === inv.id} title="Cancel invitation"
                      className="w-7 h-7 rounded-md flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filteredInvitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/60 transition-colors">
                <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground truncate block">{inv.email}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-card border border-border text-muted-foreground">{inv.project.name}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border",
                      inv.role === "ADMIN" ? "bg-primary/10 border-primary/20 text-primary" : "bg-card border-border text-muted-foreground"
                    )}>
                      {inv.projectRole?.name ?? inv.role}
                    </span>
                    <span className="text-[11px] text-muted-foreground/50">
                      Invited {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
