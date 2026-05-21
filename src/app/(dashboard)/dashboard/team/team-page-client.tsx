"use client";

import { useState } from "react";
import { Users, Mail, Clock, FolderKanban, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { updateUserRole } from "@/actions/team";
import { inviteMember } from "@/actions/project";
import { SYSTEM_ROLE_CONFIG } from "@/lib/permissions";

type SystemRole = "ADMIN" | "PM" | "TECH_LEAD" | "DEVELOPER" | "DESIGNER" | "CLIENT";

const ALL_ROLES: SystemRole[] = ["ADMIN", "PM", "TECH_LEAD", "DEVELOPER", "DESIGNER", "CLIENT"];

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
  systemRole: SystemRole;
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

interface ProjectWithRoles {
  id: string;
  name: string;
  roles: { id: string; name: string; isAdmin: boolean }[];
}

interface Props {
  members: Member[];
  invitations: Invitation[];
  projects: ProjectWithRoles[];
  isAdmin: boolean;
}

export function TeamPageClient({ members, invitations, projects, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteProjectId, setInviteProjectId] = useState(projects[0]?.id ?? "");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviting, setInviting] = useState(false);

  const selectedProject = projects.find((p) => p.id === inviteProjectId);

  async function handleRoleChange(userId: string, newRole: SystemRole) {
    setChangingRole(userId);
    try {
      await updateUserRole(userId, newRole);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setChangingRole(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteProjectId || !inviteRoleId) return;
    setInviting(true);
    try {
      await inviteMember({
        projectId: inviteProjectId,
        email: inviteEmail.trim(),
        roleId: inviteRoleId,
      });
      setShowInvite(false);
      setInviteEmail("");
      setInviteRoleId("");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setInviting(false);
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

  return (
    <div className="space-y-6">
      {/* Stats + Invite */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>
              {members.length} member{members.length !== 1 ? "s" : ""}
            </span>
          </div>
          {invitations.length > 0 && (
            <div className="flex items-center gap-2 text-[13px] text-amber-400">
              <Mail className="w-4 h-4" />
              <span>
                {invitations.length} pending invitation
                {invitations.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
        {isAdmin && projects.length > 0 && (
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
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Project</label>
                <select
                  value={inviteProjectId}
                  onChange={(e) => {
                    setInviteProjectId(e.target.value);
                    setInviteRoleId("");
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Project Role</label>
                <select
                  value={inviteRoleId}
                  onChange={(e) => setInviteRoleId(e.target.value)}
                  required
                  className="w-full h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="">Select a role...</option>
                  {(selectedProject?.roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                {selectedProject && selectedProject.roles.length === 0 && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    No roles defined for this project. Add roles in project settings first.
                  </p>
                )}
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
                  disabled={inviting || !inviteRoleId}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {inviting ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
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
        <h2 className="text-[13px] font-semibold text-foreground mb-3">
          Members
        </h2>
        <div className="space-y-1">
          {filteredMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/60 transition-colors group"
            >
              {member.imageUrl ? (
                <img
                  src={member.imageUrl}
                  alt=""
                  className="w-8 h-8 rounded-full shrink-0"
                />
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
                  {(() => {
                    const cfg = SYSTEM_ROLE_CONFIG[member.systemRole];
                    return (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          cfg.color,
                          cfg.bg
                        )}
                      >
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-muted-foreground truncate">
                    {member.email}
                  </span>
                  <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Joined{" "}
                    {formatDistanceToNow(new Date(member.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {member.projects.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="flex items-center gap-1">
                      {member.projects.slice(0, 2).map((p) => (
                        <span
                          key={p.id}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-card border border-border text-muted-foreground"
                        >
                          {p.name}
                        </span>
                      ))}
                      {member.projects.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{member.projects.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <select
                    value={member.systemRole}
                    onChange={(e) =>
                      handleRoleChange(member.id, e.target.value as SystemRole)
                    }
                    disabled={changingRole === member.id}
                    className="h-7 px-2 text-[11px] rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {SYSTEM_ROLE_CONFIG[r].label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
          {filteredMembers.length === 0 && (
            <p className="text-[13px] text-muted-foreground py-4 text-center">
              No members found.
            </p>
          )}
        </div>
      </div>

      {/* Pending Invitations */}
      {filteredInvitations.length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold text-foreground mb-3">
            Pending Invitations
          </h2>
          <div className="space-y-1">
            {filteredInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/60 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground truncate block">
                    {inv.email}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-card border border-border text-muted-foreground">
                      {inv.project.name}
                    </span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border",
                      inv.role === "ADMIN"
                        ? "bg-primary/10 border-primary/20 text-primary"
                        : "bg-card border-border text-muted-foreground"
                    )}>
                      {inv.projectRole?.name ?? inv.role}
                    </span>
                    <span className="text-[11px] text-muted-foreground/50">
                      Invited{" "}
                      {formatDistanceToNow(new Date(inv.createdAt), {
                        addSuffix: true,
                      })}
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
