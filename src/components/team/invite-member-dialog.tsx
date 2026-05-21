"use client";

import { useState } from "react";
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
import { UserPlus, Shield, Check } from "lucide-react";
import { inviteMember } from "@/actions/project";
import { cn } from "@/lib/utils";

interface WorkspaceRole {
  id: string;
  name: string;
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
}

interface Props {
  projectId: string;
  roles: WorkspaceRole[];
}

export function InviteMemberDialog({ projectId, roles }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id ?? "");

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedRoleId) return;
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    try {
      await inviteMember({
        projectId,
        email: formData.get("email") as string,
        roleId: selectedRoleId,
      });
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="mr-2 h-4 w-4" />
        Invite Member
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="colleague@company.com"
            />
          </div>
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
            <Button type="submit" disabled={loading || !selectedRoleId}>
              {loading ? "Sending..." : "Send Invite"}
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
