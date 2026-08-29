"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Check, Search, Mail, X, Loader2 } from "lucide-react";
import { AddButton } from "@/components/add-button";
import { inviteMember, addMemberToProject, getAvailableUsers } from "@/actions/project";
import { cn } from "@/lib/utils";

const ROLE_SELECT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-s text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

interface WorkspaceRole {
  id: string;
  name: string;
  isAdmin: boolean;
  isClient?: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
}

interface AvailableUser {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  isClient: boolean;
  pending: boolean;
}

interface SelectedEntry {
  userId: string;
  roleId: string;
}

interface Props {
  projectId: string;
  roles: WorkspaceRole[];
  canInviteMembers: boolean;
  canInviteClients: boolean;
  onChanged?: () => void | Promise<void>;
}

export function InviteMemberDialog({ projectId, roles, canInviteMembers, canInviteClients, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"add" | "invite">("add");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState<string>(roles[0]?.id ?? "");
  const [userSearch, setUserSearch] = useState("");
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const defaultRoleId = roles[0]?.id ?? "";
  const [selected, setSelected] = useState<SelectedEntry[]>([]);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (open && mode === "add") {
      setLoadingUsers(true);
      getAvailableUsers(projectId)
        .then(setAvailableUsers)
        .finally(() => setLoadingUsers(false));
    }
  }, [open, mode, projectId]);

  useEffect(() => {
    if (!inviteRoleId && defaultRoleId) setInviteRoleId(defaultRoleId);
  }, [defaultRoleId, inviteRoleId]);

  const visibleUsers = availableUsers.filter((u) => {
    if (u.isClient) return canInviteClients;
    return canInviteMembers;
  });

  const filteredUsers = visibleUsers.filter(
    (u) =>
      u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const selectedIds = new Set(selected.map((s) => s.userId));

  function toggleUser(userId: string) {
    setSelected((prev) => {
      if (prev.some((s) => s.userId === userId)) {
        return prev.filter((s) => s.userId !== userId);
      }
      return [...prev, { userId, roleId: defaultRoleId }];
    });
  }

  function setRoleForUser(userId: string, roleId: string) {
    setSelected((prev) =>
      prev.map((s) => (s.userId === userId ? { ...s, roleId } : s))
    );
  }

  function removeSelected(userId: string) {
    setSelected((prev) => prev.filter((s) => s.userId !== userId));
  }

  async function handleSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) return;
    setLoading(true);
    setAddProgress({ done: 0, total: selected.length });

    let done = 0;
    const errors: string[] = [];
    for (const entry of selected) {
      try {
        await addMemberToProject({ projectId, userId: entry.userId, roleId: entry.roleId });
      } catch (err) {
        const user = availableUsers.find((u) => u.id === entry.userId);
        errors.push(`${user?.name || user?.email || entry.userId}: ${(err as Error).message}`);
      }
      done++;
      setAddProgress({ done, total: selected.length });
    }

    setLoading(false);
    setAddProgress(null);

    if (errors.length > 0) {
      alert(`Some members could not be added:\n${errors.join("\n")}`);
    }

    setOpen(false);
    setSelected([]);
    setUserSearch("");
    await onChanged?.();
  }

  async function handleSubmitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim() || !inviteRoleId) return;
    setLoading(true);
    try {
      await inviteMember({
        projectId,
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        roleId: inviteRoleId,
      });
      setOpen(false);
      setInviteEmail("");
      setInviteName("");
      await onChanged?.();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setSelected([]);
      setInviteEmail("");
      setInviteName("");
      setUserSearch("");
      setMode("add");
      setAddProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<AddButton label="Add Member" />} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Team Members</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border">
          <button
            type="button"
            onClick={() => setMode("add")}
            className={cn(
              "flex-1 flex items-center justify-center gap-xs px-3 py-1.5 rounded-md text-s font-medium transition-colors",
              mode === "add"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Existing Users
          </button>
          <button
            type="button"
            onClick={() => setMode("invite")}
            className={cn(
              "flex-1 flex items-center justify-center gap-xs px-3 py-1.5 rounded-md text-s font-medium transition-colors",
              mode === "invite"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Mail className="w-3.5 h-3.5" />
            Invite by Email
          </button>
        </div>

        {mode === "add" ? (
          <form onSubmit={handleSubmitAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Select Users</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="ps-8 h-8 text-s"
                />
              </div>
              <div className="max-h-[180px] overflow-y-auto rounded-lg border border-border">
                {loadingUsers ? (
                  <p className="text-s text-muted-foreground text-center py-4">Loading...</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-s text-muted-foreground text-center py-4">
                    {availableUsers.length === 0 ? "All users are already members" : "No users match"}
                  </p>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = selectedIds.has(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        className={cn(
                          "w-full flex items-center gap-s px-3 py-2 text-start transition-colors",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/30"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                        </div>
                        {u.imageUrl ? (
                          <img src={u.imageUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                            {(u.name?.[0] || u.email[0]).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-xs">
                            <p className="text-s font-medium text-foreground truncate">{u.name || u.email}</p>
                            {u.pending && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange/15 text-orange border border-orange/30 font-medium shrink-0">
                                Pending
                              </span>
                            )}
                          </div>
                          {u.name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {selected.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Selected
                  <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                    {selected.length}
                  </span>
                </Label>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                  {selected.map((entry) => {
                    const user = availableUsers.find((u) => u.id === entry.userId);
                    if (!user) return null;
                    return (
                      <div key={entry.userId} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                        {user.imageUrl ? (
                          <img src={user.imageUrl} alt="" className="w-5 h-5 rounded-full shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                            {(user.name?.[0] || user.email[0]).toUpperCase()}
                          </div>
                        )}
                        <span className="text-s font-medium text-foreground truncate flex-1 min-w-0">
                          {user.name || user.email}
                        </span>
                        <select
                          value={entry.roleId}
                          onChange={(e) => setRoleForUser(entry.userId, e.target.value)}
                          className="h-6 w-auto min-w-[90px] rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}{r.isClient ? " (chat only)" : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeSelected(entry.userId)}
                          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {addProgress && (
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${(addProgress.done / addProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Adding {addProgress.done}/{addProgress.total}...
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || selected.length === 0}>
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />Adding...</>
                ) : (
                  `Add ${selected.length} Member${selected.length !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
              <p className="text-xs text-muted-foreground">
                Adds this email to the allowlist. They can then sign in with Google — any domain is allowed.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              {roles.length === 0 ? (
                <p className="text-s text-muted-foreground">
                  No roles yet. Create one in{" "}
                  <a href="/dashboard/roles" className="text-primary underline">
                    Roles
                  </a>
                  .
                </p>
              ) : (
                <select
                  id="invite-role"
                  value={inviteRoleId}
                  onChange={(e) => setInviteRoleId(e.target.value)}
                  required
                  className={ROLE_SELECT_CLASS}
                >
                  {!inviteRoleId && <option value="">Select a role</option>}
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.isClient ? " (chat only)" : ""}
                    </option>
                  ))}
                </select>
              )}
              {roles.find((r) => r.id === inviteRoleId)?.isClient && (
                <p className="text-xs text-muted-foreground">
                  This person will only see this project&apos;s client chat — nothing else.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !inviteName.trim() || !inviteEmail.trim() || !inviteRoleId}>
                {loading ? "Adding..." : "Allow Sign In"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
