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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Shield, Check, Search, Mail } from "lucide-react";
import { inviteMember, addMemberToProject, getAvailableUsers } from "@/actions/project";
import { cn } from "@/lib/utils";

interface WorkspaceRole {
  id: string;
  name: string;
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
}

interface AvailableUser {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
  pending: boolean;
}

interface Props {
  projectId: string;
  roles: WorkspaceRole[];
}

export function InviteMemberDialog({ projectId, roles }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"add" | "invite">("add");
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id ?? "");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (open && mode === "add") {
      setLoadingUsers(true);
      getAvailableUsers(projectId)
        .then(setAvailableUsers)
        .finally(() => setLoadingUsers(false));
    }
  }, [open, mode, projectId]);

  const filteredUsers = availableUsers.filter(
    (u) =>
      u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const selectedUser = availableUsers.find((u) => u.id === selectedUserId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoleId) return;
    setLoading(true);

    try {
      if (mode === "add") {
        if (!selectedUserId) return;
        await addMemberToProject({ projectId, userId: selectedUserId, roleId: selectedRoleId });
      } else {
        if (!inviteEmail.trim()) return;
        await inviteMember({ projectId, email: inviteEmail.trim(), roleId: selectedRoleId });
      }
      setOpen(false);
      setSelectedUserId("");
      setInviteEmail("");
      setUserSearch("");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setSelectedUserId("");
      setInviteEmail("");
      setUserSearch("");
      setMode("add");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="mr-2 h-4 w-4" />
        Add Member
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border">
          <button
            type="button"
            onClick={() => setMode("add")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              mode === "add"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Existing User
          </button>
          <button
            type="button"
            onClick={() => setMode("invite")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              mode === "invite"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Mail className="w-3.5 h-3.5" />
            Invite by Email
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "add" ? (
            <div className="space-y-2">
              <Label>Select User</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="pl-8 h-8 text-[13px]"
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border">
                {loadingUsers ? (
                  <p className="text-[12px] text-muted-foreground text-center py-4">Loading...</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-4">
                    {availableUsers.length === 0 ? "All users are already members" : "No users match"}
                  </p>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUserId(u.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                        selectedUserId === u.id
                          ? "bg-primary/10"
                          : "hover:bg-muted/30"
                      )}
                    >
                      {u.imageUrl ? (
                        <img src={u.imageUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                          {(u.name?.[0] || u.email[0]).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] font-medium text-foreground truncate">{u.name || u.email}</p>
                          {u.pending && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium shrink-0">
                              Pending
                            </span>
                          )}
                        </div>
                        {u.name && <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>}
                      </div>
                      {selectedUserId === u.id && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={2.5} />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
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
            </div>
          )}

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRoleId} onValueChange={(val) => val && setSelectedRoleId(val)}>
              <SelectTrigger>
                {selectedRole ? (
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
                    {selectedRole.name}
                  </span>
                ) : (
                  <SelectValue placeholder="Select a role" />
                )}
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
          </div>

          {selectedRole && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">Permissions</p>
              <div className="flex flex-wrap gap-1.5">
                <PermBadge label="Create tasks" enabled={selectedRole.canCreateTask} />
                <PermBadge label="Modify tasks" enabled={selectedRole.canModifyTask} />
                <PermBadge label="Move tasks" enabled={selectedRole.canMoveTask} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !selectedRoleId || (mode === "add" ? !selectedUserId : !inviteEmail.trim())}
            >
              {loading ? "Adding..." : mode === "add" ? "Add to Project" : "Send Invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border",
        enabled
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-muted text-muted-foreground/50 border-border"
      )}
    >
      {enabled && <Check className="w-2.5 h-2.5" strokeWidth={2.5} />}
      {label}
    </span>
  );
}
