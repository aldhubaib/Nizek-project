"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Pencil, Trash2, Loader2, X, Check, FolderKanban,
  ChevronDown, ChevronRight, Users, Shield, UserPlus, Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTeam, updateTeam, deleteTeam,
  addTeamMember, removeTeamMember, updateTeamMemberRole,
  getAvailableUsersForTeam,
} from "@/actions/team";

interface TeamMemberData {
  id: string;
  role: string;
  userId: string;
  user: { id: string; name: string | null; email: string; imageUrl: string | null; systemRole: string };
}

interface Team {
  id: string;
  name: string;
  isDefault: boolean;
  _count: { projects: number; members: number };
  members: TeamMemberData[];
}

interface AvailableUser {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
}

export function TeamsManager({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingMemberTo, setAddingMemberTo] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<"ADMIN" | "MEMBER">("MEMBER");

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    const result = await createTeam({ name: newName.trim() });
    if (result.error) {
      setError(result.error);
    } else {
      setNewName("");
      setCreating(false);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleUpdate(teamId: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError("");
    const result = await updateTeam({ teamId, name: editName.trim() });
    if (result.error) {
      setError(result.error);
    } else {
      setEditingId(null);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleDelete(teamId: string) {
    setDeletingId(teamId);
    setDeleteError("");
    const result = await deleteTeam(teamId);
    if (result.error) {
      setDeleteError(result.error);
      setTimeout(() => setDeleteError(""), 3000);
    } else {
      router.refresh();
    }
    setDeletingId(null);
  }

  async function handleStartAddMember(teamId: string) {
    setAddingMemberTo(teamId);
    setLoadingUsers(true);
    setSelectedUserId("");
    setSelectedRole("MEMBER");
    try {
      const users = await getAvailableUsersForTeam(teamId);
      setAvailableUsers(users);
    } catch {
      setAvailableUsers([]);
    }
    setLoadingUsers(false);
  }

  async function handleAddMember(teamId: string) {
    if (!selectedUserId) return;
    setSaving(true);
    const result = await addTeamMember({ teamId, userId: selectedUserId, role: selectedRole });
    if (result.error) {
      setError(result.error);
    } else {
      setAddingMemberTo(null);
      setSelectedUserId("");
      router.refresh();
    }
    setSaving(false);
  }

  async function handleRemoveMember(teamId: string, userId: string) {
    if (!confirm("Remove this member from the team?")) return;
    await removeTeamMember({ teamId, userId });
    router.refresh();
  }

  async function handleToggleRole(teamId: string, userId: string, currentRole: string) {
    const newRole = currentRole === "ADMIN" ? "MEMBER" : "ADMIN";
    await updateTeamMemberRole({ teamId, userId, role: newRole as "ADMIN" | "MEMBER" });
    router.refresh();
  }

  function toggleExpand(teamId: string) {
    setExpandedId(expandedId === teamId ? null : teamId);
    setAddingMemberTo(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold">Teams</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Organize projects and members by team. Each project must belong to a team.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => { setCreating(true); setError(""); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Team
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Team name..."
            className="text-[13px] h-8"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
          />
          <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()} className="h-8 px-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }} className="h-8 px-2">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {deleteError && <p className="text-[12px] text-destructive">{deleteError}</p>}

      {teams.length === 0 && !creating ? (
        <div className="text-center py-8">
          <FolderKanban className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground">No teams yet. Create your first team.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => {
            const isExpanded = expandedId === team.id;
            const adminCount = team.members.filter((m) => m.role === "ADMIN").length;

            return (
              <div key={team.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Team header */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors">
                  <button
                    onClick={() => toggleExpand(team.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    }
                    <span className="text-[13px] font-medium truncate">{team.name}</span>
                    {team.isDefault && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                        DEFAULT
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-0.5">
                        <FolderKanban className="w-3 h-3" />
                        {team._count.projects}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Users className="w-3 h-3" />
                        {team._count.members}
                      </span>
                      {adminCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Crown className="w-3 h-3 text-amber-400" />
                          {adminCount}
                        </span>
                      )}
                    </span>
                  </button>

                  {editingId === team.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-[13px] h-7 w-40"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdate(team.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button size="sm" onClick={() => handleUpdate(team.id)} disabled={saving} className="h-7 px-1.5">
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 px-1.5">
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(team.id); setEditName(team.name); setError(""); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {!team.isDefault && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(team.id); }}
                          disabled={deletingId === team.id}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          {deletingId === team.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded members */}
                {isExpanded && (
                  <div className="border-t border-border px-3 py-3 space-y-2 bg-muted/20">
                    {team.members.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-2">No members yet</p>
                    ) : (
                      <div className="space-y-1">
                        {team.members.map((m) => (
                          <div key={m.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent/30 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              {m.user.imageUrl ? (
                                <img src={m.user.imageUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                                  {(m.user.name ?? m.user.email)[0]?.toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-[12px] font-medium truncate">
                                  {m.user.name ?? m.user.email}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">{m.user.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleToggleRole(team.id, m.user.id, m.role)}
                                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                                  m.role === "ADMIN"
                                    ? "bg-amber-500/15 text-amber-400 border-amber-500/20 hover:bg-amber-500/25"
                                    : "bg-muted text-muted-foreground border-border hover:bg-accent"
                                }`}
                              >
                                {m.role === "ADMIN" ? <Crown className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                                {m.role === "ADMIN" ? "Admin" : "Member"}
                              </button>
                              <button
                                onClick={() => handleRemoveMember(team.id, m.user.id)}
                                className="rounded-md p-1 text-muted-foreground/40 hover:text-destructive transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add member */}
                    {addingMemberTo === team.id ? (
                      <div className="flex items-center gap-2 pt-1">
                        {loadingUsers ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                        ) : (
                          <>
                            <select
                              value={selectedUserId}
                              onChange={(e) => setSelectedUserId(e.target.value)}
                              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              <option value="">Select a user...</option>
                              {availableUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name ? `${u.name} (${u.email})` : u.email}
                                </option>
                              ))}
                            </select>
                            <select
                              value={selectedRole}
                              onChange={(e) => setSelectedRole(e.target.value as "ADMIN" | "MEMBER")}
                              className="rounded-md border border-border bg-background px-2 py-1 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-24"
                            >
                              <option value="MEMBER">Member</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <Button
                              size="sm"
                              onClick={() => handleAddMember(team.id)}
                              disabled={!selectedUserId || saving}
                              className="h-7 px-2 text-[11px]"
                            >
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setAddingMemberTo(null)}
                              className="h-7 px-1.5"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartAddMember(team.id)}
                        className="w-full text-[11px] text-muted-foreground hover:text-foreground h-7 border border-dashed border-border"
                      >
                        <UserPlus className="w-3 h-3 mr-1" />
                        Add Member
                      </Button>
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
