"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Clock, FolderKanban, Search, X, Ban, Trash2, ShieldCheck, Shield, AlertTriangle, ChevronDown, Eye, Pencil, UserRound, VenetianMask, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddButton } from "@/components/add-button";
import { PageHeaderActions } from "@/components/page-header-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OverflowTabBar } from "@/components/overflow-tab-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";
import { formatDistanceToNow } from "date-fns";
import { updateUserAdmin, updateUserName, updateUserProfile, inviteToTeam, toggleBlockUser, cancelTeamInvite, getUserTaskSummary, updatePendingTeamInviteName } from "@/actions/team";
import { updateMemberRole, removeMember, updateInvitationName, addMemberToProject } from "@/actions/project";
import { startImpersonation, startImpersonationByEmail } from "@/actions/impersonation";
import { joinDisplayName } from "@/lib/display-name";
import { MemberProfileFields, type GenderChoice } from "@/components/team/member-profile-fields";

interface MemberProject {
  id: string;
  name: string;
  role: string;
  roleName: string;
  /** ProjectMember row id — needed to change the role from this page. */
  memberId: string;
  roleId: string | null;
}

interface Member {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  systemRole: string;
  blocked: boolean;
  gender: "MALE" | "FEMALE" | null;
  excludeFromAlias: boolean;
  createdAt: Date;
  projects: MemberProject[];
  teams: { id: string; name: string }[];
}

interface Invitation {
  id: string;
  email: string;
  name: string | null;
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
  firstName: string | null;
  lastName: string | null;
  systemRole: string;
  createdAt: Date;
  team?: { id: string; name: string } | null;
}

interface GlobalRole {
  id: string;
  name: string;
  isAdmin: boolean;
  isClient?: boolean;
  _count: { members: number };
}

interface Props {
  members: Member[];
  invitations: Invitation[];
  teamInvites: TeamInvite[];
  roles: GlobalRole[];
  /** Non-default workspace teams (Iran, Pakistan, ...) for the invite dialog. */
  workspaceTeams?: { id: string; name: string }[];
  /** All projects, for pre-assigning the invitee to one. */
  projectOptions?: { id: string; name: string }[];
  isAdmin: boolean;
  currentUserId?: string;
}

export function TeamPageClient({ members, invitations, teamInvites, roles, workspaceTeams = [], projectOptions = [], isAdmin, currentUserId }: Props) {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  // Null means the filter is off; clicking the active chip clears it again.
  const [genderFilter, setGenderFilter] = useState<"MALE" | "FEMALE" | "none" | null>(null);
  const [aliasFilter, setAliasFilter] = useState<"real" | "aliased" | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [projectsMemberId, setProjectsMemberId] = useState<string | null>(null);
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteGender, setInviteGender] = useState<GenderChoice>("");
  const [inviteExcludeFromAlias, setInviteExcludeFromAlias] = useState(false);
  const [inviteIsAdmin, setInviteIsAdmin] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteProjects, setInviteProjects] = useState<{ projectId: string; roleId: string }[]>([]);
  const [inviting, setInviting] = useState(false);

  function resetInviteForm() {
    setInviteFirstName("");
    setInviteLastName("");
    setInviteEmail("");
    setInviteGender("");
    setInviteExcludeFromAlias(false);
    setInviteIsAdmin(false);
    setInviteTeamId("");
    setInviteProjects([]);
  }

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
    if (!inviteFirstName.trim() || !inviteLastName.trim() || !inviteEmail.trim() || !inviteGender) return;
    if (inviteProjects.some((p) => !p.projectId || !p.roleId)) {
      alert("Select a project and role for every row, or remove the empty rows.");
      return;
    }
    setInviting(true);
    try {
      await inviteToTeam({
        email: inviteEmail.trim(),
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
        gender: inviteGender,
        excludeFromAlias:
          inviteExcludeFromAlias ||
          inviteProjects.some((p) => roles.find((r) => r.id === p.roleId)?.isClient),
        systemRole: inviteIsAdmin ? "ADMIN" : "DEVELOPER",
        teamId: inviteTeamId || undefined,
        projects: inviteProjects.length > 0 ? inviteProjects : undefined,
      });
      setShowInvite(false);
      resetInviteForm();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setInviting(false);
    }
  }

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);

  const [nameEdit, setNameEdit] = useState<{
    kind: "member" | "invitation" | "team";
    id: string;
    projectId?: string;
    value: string;
    error: string | null;
    saving: boolean;
  } | null>(null);

  async function handleNameSave() {
    if (!nameEdit || nameEdit.saving) return;
    const trimmed = nameEdit.value.trim();
    if (!trimmed) {
      setNameEdit({ ...nameEdit, error: "Name is required" });
      return;
    }
    setNameEdit({ ...nameEdit, error: null, saving: true });
    try {
      let res: { error?: string } | { ok?: true } | void;
      if (nameEdit.kind === "member") {
        res = await updateUserName(nameEdit.id, trimmed);
      } else if (nameEdit.kind === "team") {
        res = await updatePendingTeamInviteName(nameEdit.id, trimmed);
      } else {
        if (!nameEdit.projectId) {
          setNameEdit({ ...nameEdit, error: "Missing project", saving: false });
          return;
        }
        res = await updateInvitationName({
          projectId: nameEdit.projectId,
          invitationId: nameEdit.id,
          name: trimmed,
        });
      }
      if (res && "error" in res && res.error) {
        setNameEdit({ ...nameEdit, error: res.error, saving: false });
        return;
      }
      setNameEdit(null);
    } catch (err) {
      setNameEdit({
        ...nameEdit,
        error: (err as Error).message || "Failed to update name",
        saving: false,
      });
    }
  }

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

  async function handleCancelInvite(inviteId: string) {
    if (!confirm("Remove this email from the allowlist?")) return;
    setActionLoading(inviteId);
    try {
      await cancelTeamInvite(inviteId);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  // Admin "sign in as user" — temporary cookie, exits via the banner.
  async function handleSignInAs(member: Member) {
    setActionLoading(member.id);
    try {
      const res = await startImpersonation(member.id);
      if (res?.error) {
        alert(res.error);
        setActionLoading(null);
        return;
      }
      // Full reload so every cache and realtime subscription belongs to them.
      window.location.href = res.redirectTo ?? "/dashboard";
    } catch (err) {
      alert((err as Error).message || "Failed to sign in as user");
      setActionLoading(null);
    }
  }

  async function handleSignInAsEmail(email: string) {
    setActionLoading(email);
    try {
      const res = await startImpersonationByEmail(email);
      if (res?.error) {
        alert(res.error);
        setActionLoading(null);
        return;
      }
      window.location.href = res.redirectTo ?? "/dashboard";
    } catch (err) {
      alert((err as Error).message || "Failed to sign in as user");
      setActionLoading(null);
    }
  }

  // All teams that at least one member belongs to, for the filter pills.
  const allTeams = (() => {
    const map = new Map<string, string>();
    for (const m of members) for (const t of m.teams) map.set(t.id, t.name);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const matchesSearch = (m: Member) =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase());
  const matchesTeam = (m: Member) =>
    teamFilter === "all" || m.teams.some((t) => t.id === teamFilter);

  // Both tag filters only ever match the people who carry those tags, so a
  // client — who reads the aliases rather than having one — is never a hit.
  const matchesGender = (m: Member) => {
    if (genderFilter === null) return true;
    if (m.systemRole === "CLIENT") return false;
    return genderFilter === "none" ? m.gender === null : m.gender === genderFilter;
  };
  const matchesAlias = (m: Member) => {
    if (aliasFilter === null) return true;
    if (m.systemRole === "CLIENT") return false;
    return aliasFilter === "real" ? m.excludeFromAlias : !m.excludeFromAlias;
  };

  const filteredMembers = members.filter(
    (m) => matchesSearch(m) && matchesTeam(m) && matchesGender(m) && matchesAlias(m),
  );

  // Counts follow the team and search already in force, so they describe the
  // list on screen. They deliberately ignore the other tag filter, which keeps
  // a number from dropping to zero the moment you pick something next to it.
  const tagScope = members.filter(
    (m) => matchesSearch(m) && matchesTeam(m) && m.systemRole !== "CLIENT",
  );
  const tagFilters = [
    {
      key: "MALE" as const,
      label: "Male",
      icon: UserRound,
      count: tagScope.filter((m) => m.gender === "MALE").length,
      active: genderFilter === "MALE",
      activeClass: "border-primary/40 bg-primary/15 text-primary",
      onClick: () => setGenderFilter((g) => (g === "MALE" ? null : "MALE")),
    },
    {
      key: "FEMALE" as const,
      label: "Female",
      icon: UserRound,
      count: tagScope.filter((m) => m.gender === "FEMALE").length,
      active: genderFilter === "FEMALE",
      activeClass: "border-primary/40 bg-primary/15 text-primary",
      onClick: () => setGenderFilter((g) => (g === "FEMALE" ? null : "FEMALE")),
    },
    {
      key: "none" as const,
      label: "No gender",
      icon: UserRound,
      count: tagScope.filter((m) => m.gender === null).length,
      active: genderFilter === "none",
      activeClass: "border-orange/40 bg-orange/15 text-orange",
      onClick: () => setGenderFilter((g) => (g === "none" ? null : "none")),
    },
    { key: "divider" as const },
    {
      key: "real" as const,
      label: "Real name",
      icon: VenetianMask,
      count: tagScope.filter((m) => m.excludeFromAlias).length,
      active: aliasFilter === "real",
      activeClass: "border-violet/40 bg-violet/15 text-violet",
      onClick: () => setAliasFilter((a) => (a === "real" ? null : "real")),
    },
    {
      key: "aliased" as const,
      label: "Aliased",
      icon: VenetianMask,
      count: tagScope.filter((m) => !m.excludeFromAlias).length,
      active: aliasFilter === "aliased",
      activeClass: "border-primary/40 bg-primary/15 text-primary",
      onClick: () => setAliasFilter((a) => (a === "aliased" ? null : "aliased")),
    },
  ];

  const filteredInvitations = invitations.filter((inv) =>
    inv.email.toLowerCase().includes(search.toLowerCase()) ||
    (inv.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const filteredTeamInvites = teamInvites.filter((inv) =>
    inv.email.toLowerCase().includes(search.toLowerCase()) ||
    joinDisplayName(inv.firstName, inv.lastName).toLowerCase().includes(search.toLowerCase())
  );

  const teamFilterItems = [
    { id: "all", label: "All teams", count: members.length },
    ...allTeams.map((t) => ({
      id: t.id,
      label: t.name,
      count: members.filter((m) => m.teams.some((mt) => mt.id === t.id)).length,
    })),
  ];

  return (
    <div className="min-w-0 max-w-full space-y-6">
      {isAdmin && (
        <PageHeaderActions>
          <AddButton label="Add Member" onClick={() => setShowInvite(true)} />
        </PageHeaderActions>
      )}
      {/* Invite Dialog */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
          <div className="w-full max-w-sm rounded-xl border border-border bg-sidebar p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-s font-semibold text-foreground">Add Member</h3>
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
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">First name</label>
                  <input
                    type="text"
                    required
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    placeholder="Jane"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Last name</label>
                  <input
                    type="text"
                    required
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <MemberProfileFields
                gender={inviteGender}
                onGenderChange={setInviteGender}
                excludeFromAlias={
                  inviteExcludeFromAlias ||
                  inviteProjects.some((p) => roles.find((r) => r.id === p.roleId)?.isClient)
                }
                onExcludeFromAliasChange={setInviteExcludeFromAlias}
                excludeLocked={inviteProjects.some((p) => roles.find((r) => r.id === p.roleId)?.isClient)}
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Team</label>
                <select
                  value={inviteTeamId}
                  onChange={(e) => setInviteTeamId(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border border-border bg-card text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="">No team</option>
                  {workspaceTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Projects</label>
                <div className="space-y-2">
                  {inviteProjects.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={row.projectId}
                        onChange={(e) =>
                          setInviteProjects((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, projectId: e.target.value } : r)),
                          )
                        }
                        className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-border bg-card text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        <option value="">Select project...</option>
                        {projectOptions
                          .filter(
                            (p) =>
                              p.id === row.projectId ||
                              !inviteProjects.some((r) => r.projectId === p.id),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                      <select
                        value={row.roleId}
                        onChange={(e) =>
                          setInviteProjects((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, roleId: e.target.value } : r)),
                          )
                        }
                        disabled={!row.projectId}
                        className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-border bg-card text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                      >
                        <option value="">Select role...</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setInviteProjects((rows) => rows.filter((_, i) => i !== idx))}
                        className="w-7 h-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove project"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <AddButton
                    label="Add project"
                    disabled={inviteProjects.length >= projectOptions.length}
                    onClick={() => setInviteProjects((rows) => [...rows, { projectId: "", roleId: "" }])}
                  />
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setInviteIsAdmin(!inviteIsAdmin)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-s font-medium transition-colors w-full",
                    inviteIsAdmin
                      ? "bg-purple/15 border-purple/30 text-purple"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-sm border flex items-center justify-center transition-colors",
                      inviteIsAdmin ? "bg-purple border-purple" : "border-muted-foreground/40"
                    )}
                  >
                    {inviteIsAdmin && <ShieldCheck className="w-3 h-3 text-white" strokeWidth={2.5} />}
                  </div>
                  Grant system admin access
                </button>
                <p className="text-xs text-muted-foreground/60 mt-1 ms-1">
                  Admins have full access. Assign project roles when adding members to projects.
                </p>
              </div>
              <p className="text-xs text-muted-foreground/60">
                No invitation email is sent. Once added, they can sign in with Google using this address — any domain is allowed.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="px-3 py-1.5 rounded-lg text-s text-muted-foreground hover:bg-card transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteFirstName.trim() || !inviteLastName.trim() || !inviteEmail.trim() || !inviteGender || inviteProjects.some((p) => !p.projectId || !p.roleId)}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-s font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {inviting ? "Adding..." : "Allow Sign In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Block Transfer Dialog */}
      {blockTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange" />
              </div>
              <div>
                <h3 className="text-s font-semibold text-foreground">Transfer Tasks Before Blocking</h3>
                <p className="text-s text-muted-foreground mt-0.5">
                  <strong>{blockTransfer.userName}</strong> has tasks across {blockTransfer.projects.length} project{blockTransfer.projects.length !== 1 ? "s" : ""}.
                  Select who should take over in each project.
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              {blockTransfer.projects.map((proj) => (
                <div key={proj.id} className="rounded-lg bg-muted/30 border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-s font-medium text-foreground">{proj.name}</span>
                    <span className="text-xs text-muted-foreground">
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
                    className="w-full h-8 px-2 rounded-md border border-border bg-card text-s text-foreground"
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
                className="px-3 py-1.5 rounded-lg text-s text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBlockWithTransfer}
                disabled={blockLoading || blockTransfer.projects.some((p) => !p.transferToUserId)}
                className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-s font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {blockLoading ? "Processing..." : "Transfer & Block"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden">
        <div className="relative w-full min-w-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-full ps-8"
          />
        </div>
        {allTeams.length > 0 && (
          <OverflowTabBar
            items={teamFilterItems}
            value={teamFilter}
            onChange={setTeamFilter}
            justify="start"
            mobileMaxVisible={2}
            className="w-full min-w-0 overflow-hidden"
          />
        )}
        {/* Kept on screen while a chip is active even if the team in view has
            nobody to tag, so an empty list always has its cause next to it. */}
        {(tagScope.length > 0 || genderFilter !== null || aliasFilter !== null) && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {tagFilters.map((f) =>
              f.key === "divider" ? (
                <span
                  key="divider"
                  aria-hidden
                  className="mx-1 hidden h-4 w-px bg-border sm:block"
                />
              ) : (
                <TagFilterChip
                  key={f.key}
                  label={f.label}
                  count={f.count}
                  icon={f.icon}
                  active={f.active}
                  activeClass={f.activeClass}
                  onClick={f.onClick}
                />
              ),
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-s font-semibold">Team Members</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMembers.map((member) => {
            const initials =
              member.name
                ?.split(" ")
                .map((n) => n[0])
                .join("") ?? member.email[0]?.toUpperCase();
            const isSelf = member.id === currentUserId;
            const roleLabel = member.systemRole === "ADMIN" ? "Admin" : "Member";
            // Clients are who the aliases are for, so neither tag says anything
            // about them.
            const aliasApplies = member.systemRole !== "CLIENT";

            return (
              <div
                key={member.id}
                className="rounded-lg bg-card border border-border p-4 hover:border-muted-foreground/20 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-s min-w-0">
                    {member.imageUrl ? (
                      <img
                        src={member.imageUrl}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-s font-semibold text-primary shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-s font-medium text-foreground truncate">
                        {member.name || member.email}
                        {isSelf && (
                          <span className="ms-1 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      <p className="text-xs text-muted-foreground/50 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        Joined {formatDistanceToNow(new Date(member.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-0.5 shrink-0 -mt-0.5 -me-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditMemberId(member.id)}
                        title="Edit member"
                        className="text-muted-foreground/40 hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </Button>
                      {!isSelf && !member.blocked && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleSignInAs(member)}
                          disabled={actionLoading === member.id}
                          title={`Sign in as ${member.name ?? member.email}`}
                          className="text-muted-foreground/40 hover:text-foreground"
                        >
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleBlock(member.id)}
                        disabled={actionLoading === member.id}
                        title={member.blocked ? "Unblock user" : "Block user"}
                        className={cn(
                          "text-muted-foreground/40",
                          member.blocked
                            ? "hover:text-success"
                            : "hover:text-destructive",
                        )}
                      >
                        {member.blocked ? (
                          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
                        ) : (
                          <Ban className="w-3.5 h-3.5" strokeWidth={1.5} />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {isAdmin && !isSelf ? (
                    <button
                      type="button"
                      onClick={() => handleAdminToggle(member.id, member.systemRole !== "ADMIN")}
                      disabled={changingRole === member.id}
                      title={member.systemRole === "ADMIN" ? "Remove admin" : "Make admin"}
                      className={cn(
                        "inline-flex h-7 items-center gap-xs rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-50",
                        member.systemRole === "ADMIN"
                          ? "border-purple/30 bg-purple/15 text-purple hover:bg-purple/25"
                          : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                      )}
                    >
                      <Shield className="w-3 h-3" strokeWidth={1.5} />
                      {roleLabel}
                    </button>
                  ) : (
                    <StatusBadge
                      size="sm"
                      config={
                        member.systemRole === "ADMIN"
                          ? outlineBadge("Admin", "text-purple", "border-purple/30")
                          : outlineBadge("Member", "text-muted-foreground", "border-border")
                      }
                      icon={Shield}
                    />
                  )}
                  {member.blocked && (
                    <StatusBadge
                      size="sm"
                      config={outlineBadge("Blocked", "text-destructive", "border-destructive/30")}
                    />
                  )}
                  {aliasApplies && (
                    <>
                      <StatusBadge
                        size="sm"
                        icon={UserRound}
                        config={
                          member.gender
                            ? outlineBadge(
                                member.gender === "MALE" ? "Male" : "Female",
                                "text-muted-foreground",
                                "border-border",
                              )
                            : // The pool is matched on gender, so a blank one is
                              // the reason someone joins a project unaliased.
                              outlineBadge("No gender", "text-orange", "border-orange/30")
                        }
                        title={
                          member.gender
                            ? "Aliases are drawn from the pool of this gender"
                            : "No gender recorded, so no alias can be drawn for them"
                        }
                      />
                      <StatusBadge
                        size="sm"
                        icon={VenetianMask}
                        config={
                          member.excludeFromAlias
                            ? outlineBadge("Real name", "text-violet", "border-violet/30")
                            : outlineBadge("Aliased", "text-muted-foreground", "border-border")
                        }
                        title={
                          member.excludeFromAlias
                            ? "Excluded from aliases: clients see their real name on every project"
                            : "Clients see an alias instead of their real name"
                        }
                      />
                    </>
                  )}
                </div>

                {(isAdmin || member.projects.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setProjectsMemberId(member.id)}
                    className="mt-3 flex w-full items-center gap-xs border-t border-border/50 pt-3 text-start text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1">
                      {member.projects.length}{" "}
                      {member.projects.length === 1 ? "project" : "projects"}
                    </span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {filteredMembers.length === 0 && (
          <p className="text-s text-muted-foreground py-8 text-center">No members found.</p>
        )}
      </div>

      {(filteredTeamInvites.length > 0 || filteredInvitations.length > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
            <span className="text-xs font-medium text-muted-foreground/70">
              Awaiting Sign In
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTeamInvites.map((inv) => {
              const displayName = joinDisplayName(inv.firstName, inv.lastName);
              return (
                <div
                  key={inv.id}
                  className="rounded-lg bg-card border border-dashed border-border p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-s min-w-0">
                      <div className="w-9 h-9 rounded-full bg-orange/15 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-orange" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        {nameEdit?.kind === "team" && nameEdit.id === inv.id ? (
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
                            <span className="truncate">{displayName || inv.email}</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  setNameEdit({
                                    kind: "team",
                                    id: inv.id,
                                    value: displayName,
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
                        {displayName && (
                          <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
                        )}
                        <div className="flex items-center gap-xs mt-0.5">
                          <StatusBadge
                            size="sm"
                            config={outlineBadge("Added", "text-orange", "border-orange/30")}
                            icon={Clock}
                          />
                          <span className="text-xs text-muted-foreground/50">
                            {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-0.5 shrink-0 -mt-0.5 -me-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleSignInAsEmail(inv.email)}
                          disabled={actionLoading === inv.email || actionLoading === inv.id}
                          title={`Sign in as ${inv.email}`}
                          className="text-muted-foreground/40 hover:text-foreground"
                        >
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCancelInvite(inv.id)}
                          disabled={actionLoading === inv.id}
                          title="Remove from allowlist"
                          className="text-muted-foreground/40 hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {inv.systemRole === "ADMIN" && (
                      <StatusBadge
                        size="sm"
                        config={outlineBadge("Admin", "text-purple", "border-purple/30")}
                        icon={Shield}
                      />
                    )}
                    {inv.team && (
                      <StatusBadge
                        size="sm"
                        config={outlineBadge(inv.team.name, "text-muted-foreground", "border-border")}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {filteredInvitations.map((inv) => {
              const displayName = inv.name?.trim() || "";
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
                            <span className="truncate">{displayName || inv.email}</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  setNameEdit({
                                    kind: "invitation",
                                    id: inv.id,
                                    projectId: inv.project.id,
                                    value: displayName,
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
                        {displayName && (
                          <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
                        )}
                        <div className="flex items-center gap-xs mt-0.5">
                          <StatusBadge
                            size="sm"
                            config={outlineBadge("Added", "text-orange", "border-orange/30")}
                            icon={Clock}
                          />
                          <span className="text-xs text-muted-foreground/50">
                            {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleSignInAsEmail(inv.email)}
                        disabled={actionLoading === inv.email}
                        title={`Sign in as ${inv.email}`}
                        className="text-muted-foreground/40 hover:text-foreground shrink-0 -mt-0.5 -me-1"
                      >
                        <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      size="sm"
                      config={outlineBadge(inv.project.name, "text-muted-foreground", "border-border")}
                    />
                    <StatusBadge
                      size="sm"
                      config={
                        inv.role === "ADMIN"
                          ? outlineBadge(roleName, "text-primary", "border-primary/30")
                          : outlineBadge(roleName, "text-muted-foreground", "border-border")
                      }
                      icon={Shield}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {projectsMemberId && (() => {
        const member = members.find((m) => m.id === projectsMemberId);
        if (!member) return null;
        return (
          <MemberProjectsDialog
            member={member}
            roles={roles}
            projectOptions={projectOptions}
            canManage={isAdmin}
            onClose={() => setProjectsMemberId(null)}
          />
        );
      })()}
      {editMemberId && (() => {
        const member = members.find((m) => m.id === editMemberId);
        if (!member) return null;
        return (
          <EditMemberDialog
            member={member}
            onClose={() => setEditMemberId(null)}
          />
        );
      })()}
    </div>
  );
}

/**
 * Secondary filter chip, sized under the team pills so the row reads as the
 * narrower cut. Carries the same colour as the tag it filters on, so "No
 * gender" and "Real name" match the badges on the cards.
 */
function TagFilterChip({
  label,
  count,
  icon: Icon,
  active,
  activeClass,
  onClick,
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  active: boolean;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Showing ${label} only — click to clear` : `Show ${label} only`}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-xs rounded-full border px-2.5 text-xs font-medium leading-none transition-colors",
        active
          ? activeClass
          : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.5} />
      {label}
      <span className="opacity-60">{count}</span>
    </button>
  );
}

function NameEditRow({
  value,
  saving,
  error,
  hint,
  type = "text",
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  saving: boolean;
  error: string | null;
  hint?: string;
  type?: "text" | "email";
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
      className="space-y-1 mb-1"
    >
      <div className="flex items-center gap-xs">
        <input
          type={type}
          value={value}
          autoFocus
          disabled={saving}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
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
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground/60">{hint}</p>
      ) : null}
    </form>
  );
}

function EditMemberDialog({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name ?? "");
  const [email, setEmail] = useState(member.email);
  const [gender, setGender] = useState<GenderChoice>(member.gender ?? "");
  const [excludeFromAlias, setExcludeFromAlias] = useState(member.excludeFromAlias);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
    if (!gender) {
      setError("Gender is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await updateUserProfile({
        userId: member.id,
        name: trimmedName,
        email: trimmedEmail,
        gender,
        excludeFromAlias: member.systemRole === "CLIENT" || excludeFromAlias,
      });
      if (res?.error) {
        setError(res.error);
        setSaving(false);
        return;
      }
      onClose();
    } catch (err) {
      setError((err as Error).message || "Failed to update member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={onClose}
    >
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-sidebar p-5 shadow-xl mx-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-s font-semibold text-foreground">Edit member</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-card transition-colors text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className="w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            className="w-full h-9 px-3 rounded-lg border border-border bg-card text-s text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground/60 mt-1">
            Must be a Google account — the old one keeps working too
          </p>
        </div>
        <MemberProfileFields
          gender={gender}
          onGenderChange={setGender}
          excludeFromAlias={member.systemRole === "CLIENT" || excludeFromAlias}
          onExcludeFromAliasChange={setExcludeFromAlias}
          excludeLocked={member.systemRole === "CLIENT"}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-s text-muted-foreground hover:bg-card transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || !email.trim() || !gender}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-s font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MemberProjectsDialog({
  member,
  roles,
  projectOptions,
  canManage,
  onClose,
}: {
  member: Member;
  roles: GlobalRole[];
  projectOptions: { id: string; name: string }[];
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const userName = member.name ?? member.email;
  const assignedIds = new Set(member.projects.map((p) => p.id));
  const available = projectOptions.filter((p) => !assignedIds.has(p.id));

  const [addProjectId, setAddProjectId] = useState("");
  const [addRoleId, setAddRoleId] = useState(roles[0]?.id ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{
    project: MemberProject;
    taskCount: number;
    targets: { id: string; name: string | null; systemRole: string }[];
    transferToUserId: string;
  } | null>(null);

  async function handleAdd() {
    if (!addProjectId || !addRoleId) return;
    setSaving("add");
    try {
      await addMemberToProject({
        projectId: addProjectId,
        userId: member.id,
        roleId: addRoleId,
      });
      setAddProjectId("");
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to add to project");
    } finally {
      setSaving(null);
    }
  }

  async function handleRoleChange(project: MemberProject, roleId: string) {
    if (roleId === project.roleId) return;
    setSaving(project.id);
    try {
      await updateMemberRole({ projectId: project.id, memberId: project.memberId, roleId });
      router.refresh();
    } catch (err) {
      alert((err as Error).message || "Failed to update role");
    } finally {
      setSaving(null);
    }
  }

  async function handleRemove(project: MemberProject, transferToUserId?: string) {
    setSaving(project.id);
    try {
      const result = await removeMember({
        projectId: project.id,
        memberId: project.memberId,
        transferToUserId,
      });
      if (result.success) {
        setTransfer(null);
        router.refresh();
        return;
      }
      const match = result.error.match(/^TRANSFER_REQUIRED:(\d+)$/);
      if (match) {
        const summary = await getUserTaskSummary(member.id);
        const entry = summary.find((p) => p.id === project.id);
        setTransfer({
          project,
          taskCount: parseInt(match[1], 10),
          targets: entry?.eligibleTransferTargets ?? [],
          transferToUserId: "",
        });
      } else {
        alert(result.error || "Failed to remove member");
      }
    } catch (err) {
      alert((err as Error).message || "Failed to remove member");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-sidebar p-5 shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-s font-semibold text-foreground">Projects</h3>
            <p className="text-xs text-muted-foreground truncate">{userName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-card transition-colors text-muted-foreground shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {member.projects.length === 0 && (
            <p className="py-6 text-center text-s text-muted-foreground">
              Not on any projects yet.
            </p>
          )}
          {member.projects
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-card/60"
              >
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate text-s text-foreground">{project.name}</span>
                {canManage ? (
                  <select
                    value={project.roleId ?? ""}
                    disabled={saving === project.id}
                    onChange={(e) => {
                      if (e.target.value) void handleRoleChange(project, e.target.value);
                    }}
                    className="h-7 max-w-[8.5rem] shrink-0 rounded-md border border-border bg-card px-1.5 text-xs text-foreground disabled:opacity-50"
                  >
                    {!project.roleId && <option value="">{project.roleName || "Role"}</option>}
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {project.roleName || project.role}
                  </span>
                )}
                {canManage && (
                  <button
                    type="button"
                    disabled={saving === project.id}
                    title={`Remove from ${project.name}`}
                    onClick={() => {
                      if (confirm(`Remove ${userName} from ${project.name}?`)) {
                        void handleRemove(project);
                      }
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            ))}
        </div>

        {canManage && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Add to a project</p>
            {available.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">Already on every project.</p>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={addProjectId}
                  onChange={(e) => setAddProjectId(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-s text-foreground"
                >
                  <option value="">Select project...</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={addRoleId}
                  onChange={(e) => setAddRoleId(e.target.value)}
                  disabled={!addProjectId}
                  className="h-9 w-[7.5rem] shrink-0 rounded-lg border border-border bg-card px-2 text-s text-foreground disabled:opacity-50"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!addProjectId || !addRoleId || saving === "add"}
                  onClick={() => void handleAdd()}
                  className="h-9 shrink-0 rounded-lg bg-primary px-3 text-s font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving === "add" ? "Adding..." : "Add"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {transfer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange" />
              </div>
              <div>
                <h3 className="text-s font-semibold text-foreground">Transfer Tasks Required</h3>
                <p className="text-s text-muted-foreground mt-0.5">
                  <strong>{userName}</strong> has <strong>{transfer.taskCount}</strong> task
                  {transfer.taskCount !== 1 ? "s" : ""} in <strong>{transfer.project.name}</strong>.
                  Select a member to transfer them to before removal.
                </p>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Transfer tasks to</label>
              <select
                value={transfer.transferToUserId}
                onChange={(e) =>
                  setTransfer((s) => (s ? { ...s, transferToUserId: e.target.value } : s))
                }
                className="w-full h-9 px-2 rounded-lg border border-border bg-background text-s text-foreground"
              >
                <option value="">Select a member...</option>
                {transfer.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name ?? t.id} ({t.systemRole})
                  </option>
                ))}
              </select>
              {transfer.targets.length === 0 && (
                <p className="text-xs text-destructive mt-1.5">
                  No other members in this project to transfer tasks to.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setTransfer(null)}
                disabled={saving === transfer.project.id}
                className="px-3 py-1.5 rounded-lg text-s text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRemove(transfer.project, transfer.transferToUserId)}
                disabled={!transfer.transferToUserId || saving === transfer.project.id}
                className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-s font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {saving === transfer.project.id ? "Transferring..." : "Transfer & Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
