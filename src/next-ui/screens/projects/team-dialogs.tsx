"use client";

import * as React from "react";
import { Mail, Search, UserPlus } from "lucide-react";

import { Chip } from "@/next-ui/blocks";
import { useProjectRoles, type ProjectDetail, type ProjectInvitation, type ProjectRole } from "@/next-ui/data/projects";
import {
  TransferRequiredError,
  useAddMembers,
  useAvailableUsers,
  useCancelInvitation,
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
  type AvailableUser,
} from "@/next-ui/data/team";
import { cn } from "@/next-ui/lib/cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Button } from "@/next-ui/ui/button";
import { Checkbox } from "@/next-ui/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";
import { Skeleton } from "@/next-ui/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/next-ui/ui/tabs";

/**
 * The dialogs of the Team page: adding people (by account or by email), giving a member another
 * role, removing a member (handing their open tasks to someone first when they have any) and
 * cancelling an invitation. Each calls the same server action the live panel does and closes
 * when it is done; what went wrong is said in the dialog.
 */

type Member = ProjectDetail["members"][number];

export interface TeamRights {
  canInviteMembers: boolean;
  canInviteClients: boolean;
}

/** The roles this viewer may give: a client role needs the right to invite clients, any other the right to invite members. */
export function allowedRoles(roles: readonly ProjectRole[], rights: TeamRights): ProjectRole[] {
  return roles.filter((r) => (r.isClient ? rights.canInviteClients : rights.canInviteMembers));
}

/** The role a new person gets unless another is chosen: the first ordinary one (not Admin, not a client role), else the first allowed. */
export function defaultRoleId(roles: readonly ProjectRole[]): string {
  return (roles.find((r) => !r.isAdmin && !r.isClient) ?? roles[0])?.id ?? "";
}

/** The people this viewer may add: clients only with the right to invite clients, the others only with the right to invite members. */
export function addableUsers(users: readonly AvailableUser[], rights: TeamRights): AvailableUser[] {
  return users.filter((u) => (u.isClient ? rights.canInviteClients : rights.canInviteMembers));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm whitespace-pre-line text-destructive">
      {children}
    </p>
  );
}

function RoleSelect({
  roles,
  value,
  onChange,
  id,
  disabled,
}: {
  roles: readonly ProjectRole[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || roles.length === 0}>
      <SelectTrigger id={id} className="w-full" data-testid="role-select">
        <SelectValue placeholder={roles.length === 0 ? "No roles to give" : "Choose a role"} />
      </SelectTrigger>
      <SelectContent position="popper">
        {roles.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.name}
            {r.isAdmin && <span className="text-muted-foreground"> · Admin</span>}
            {r.isClient && <span className="text-muted-foreground"> · Client</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PersonAvatar({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  return (
    <Avatar className={className}>
      {imageUrl && <AvatarImage src={imageUrl} alt="" />}
      <AvatarFallback className="text-xs">{name.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}

/**
 * "Add people": two ways in. "Has an account" lists everyone not on the project yet (and
 * people with a pending team invite), to tick one or more and give them one role. "By email"
 * invites someone new: their name, their email, a role, and whether they are a man or a woman
 * (optional; the invitation and the chat address them by it).
 */
export function AddPeopleDialog({
  projectId,
  open,
  onOpenChange,
  rights,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rights: TeamRights;
}) {
  const roles = useProjectRoles(projectId);
  const allowed = React.useMemo(() => allowedRoles(roles.data ?? [], rights), [roles.data, rights]);
  const [tab, setTab] = React.useState<"account" | "email">("account");

  const reset = () => setTab("account");
  const close = () => {
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="add-people-dialog">
        <DialogHeader>
          <DialogTitle>Add people</DialogTitle>
          <DialogDescription>Someone who already has an account joins at once; someone new gets an invitation by email.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "account" | "email")}>
          <TabsList className="w-full">
            <TabsTrigger value="account" className="flex-1">
              <UserPlus />
              Has an account
            </TabsTrigger>
            <TabsTrigger value="email" className="flex-1">
              <Mail />
              By email
            </TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="mt-3">
            <AddByAccount projectId={projectId} roles={allowed} rolesPending={roles.isPending} rights={rights} active={open && tab === "account"} onDone={close} />
          </TabsContent>
          <TabsContent value="email" className="mt-3">
            <InviteByEmail projectId={projectId} roles={allowed} rolesPending={roles.isPending} onDone={close} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AddByAccount({
  projectId,
  roles,
  rolesPending,
  rights,
  active,
  onDone,
}: {
  projectId: string;
  roles: ProjectRole[];
  rolesPending: boolean;
  rights: TeamRights;
  active: boolean;
  onDone: () => void;
}) {
  const users = useAvailableUsers(projectId, active);
  const add = useAddMembers(projectId);
  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [roleId, setRoleId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const role = roleId || defaultRoleId(roles);

  const candidates = React.useMemo(() => addableUsers(users.data ?? [], rights), [users.data, rights]);
  const q = search.trim().toLowerCase();
  const shown = q ? candidates.filter((u) => u.name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : candidates;
  const toggle = (id: string, on: boolean) => setPicked((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));

  const submit = () => {
    const chosen = candidates.filter((u) => picked.includes(u.id));
    if (chosen.length === 0 || !role) return;
    setError(null);
    add.mutate(
      { users: chosen, roleId: role },
      {
        onSuccess: () => {
          setPicked([]);
          setSearch("");
          onDone();
        },
        onError: (err) => setError(err instanceof Error ? err.message : "Could not add them."),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" className="pl-8" aria-label="Search people" />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border" data-testid="addable-people">
        {users.isPending ? (
          <div className="flex flex-col gap-2 p-3" aria-busy>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : users.error ? (
          <p className="p-3 text-sm text-muted-foreground">Could not load the people.</p>
        ) : shown.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{candidates.length === 0 ? "Everyone with an account is already on this project." : "Nobody matches."}</p>
        ) : (
          <ul className="flex flex-col p-1">
            {shown.map((u) => {
              const name = u.name || u.email;
              const on = picked.includes(u.id);
              return (
                <li key={u.id}>
                  <label className={cn("flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60", on && "bg-muted/40")}>
                    <Checkbox checked={on} onCheckedChange={(v) => toggle(u.id, v === true)} aria-label={`Add ${name}`} />
                    <PersonAvatar name={name} imageUrl={u.imageUrl} className="size-7" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{name}</span>
                      {u.name && <span className="truncate text-xs text-muted-foreground">{u.email}</span>}
                    </span>
                    {u.isClient && <Chip>Client</Chip>}
                    {u.pending && <Chip variant="secondary">Invited to Nizek</Chip>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-role">Role for {picked.length > 1 ? "all of them" : "them"}</Label>
        {rolesPending ? <Skeleton className="h-8 w-full" /> : <RoleSelect id="add-role" roles={roles} value={role} onChange={setRoleId} />}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button onClick={submit} disabled={picked.length === 0 || !role || add.isPending} data-testid="add-people-submit">
          {add.isPending ? "Adding…" : picked.length > 1 ? `Add ${picked.length} people` : "Add"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function InviteByEmail({
  projectId,
  roles,
  rolesPending,
  onDone,
}: {
  projectId: string;
  roles: ProjectRole[];
  rolesPending: boolean;
  onDone: () => void;
}) {
  const invite = useInviteMember(projectId);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [gender, setGender] = React.useState<"none" | "MALE" | "FEMALE">("none");
  const [error, setError] = React.useState<string | null>(null);
  const role = roleId || defaultRoleId(roles);
  const ready = name.trim() !== "" && EMAIL.test(email.trim()) && role !== "";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    invite.mutate(
      { name: name.trim(), email: email.trim(), roleId: role, gender: gender === "none" ? null : gender },
      {
        onSuccess: () => {
          setName("");
          setEmail("");
          setGender("none");
          onDone();
        },
        onError: (err) => setError(err instanceof Error ? err.message : "Could not send the invitation."),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="invite-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="off" required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          {rolesPending ? <Skeleton className="h-8 w-full" /> : <RoleSelect id="invite-role" roles={roles} value={role} onChange={setRoleId} />}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-gender">Addressed as</Label>
          <Select value={gender} onValueChange={(v) => setGender(v as "none" | "MALE" | "FEMALE")}>
            <SelectTrigger id="invite-gender" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="none">Not set</SelectItem>
              <SelectItem value="MALE">A man</SelectItem>
              <SelectItem value="FEMALE">A woman</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">They get an email with a link to join; the invitation is good for 7 days.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!ready || invite.isPending} data-testid="invite-submit">
          {invite.isPending ? "Sending…" : "Send invitation"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Change role": the member's name, the project's roles to pick from, Save. */
export function ChangeRoleDialog({
  projectId,
  member,
  rights,
  onClose,
}: {
  projectId: string;
  member: Member | null;
  rights: TeamRights;
  onClose: () => void;
}) {
  const roles = useProjectRoles(projectId);
  const update = useUpdateMemberRole(projectId);
  const [roleId, setRoleId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const allowed = React.useMemo(() => allowedRoles(roles.data ?? [], rights), [roles.data, rights]);
  const current = member?.projectRole?.id ?? "";
  const value = roleId ?? current;
  const name = member ? member.user.name || member.user.email : "";

  const close = () => {
    onClose();
    setRoleId(null);
    setError(null);
  };
  const save = () => {
    if (!member || !value || value === current) return;
    setError(null);
    update.mutate(
      { memberId: member.id, roleId: value },
      { onSuccess: close, onError: (err) => setError(err instanceof Error ? err.message : "Could not change the role.") },
    );
  };

  return (
    <Dialog open={member !== null} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-sm" data-testid="change-role-dialog">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>What {name} may do on this project, stage by stage, follows the role.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="member-role">Role</Label>
          {roles.isPending ? <Skeleton className="h-8 w-full" /> : <RoleSelect id="member-role" roles={allowed} value={value} onChange={setRoleId} />}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={save} disabled={!value || value === current || update.isPending} data-testid="change-role-submit">
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Remove from project": a plain confirmation; when the server answers that the person still
 * owns open tasks, the dialog asks whom to hand them to and removes with the hand-over.
 */
export function RemoveMemberDialog({
  projectId,
  project,
  member,
  onClose,
}: {
  projectId: string;
  project: Pick<ProjectDetail, "name" | "members">;
  member: Member | null;
  onClose: () => void;
}) {
  const remove = useRemoveMember(projectId);
  const [transfer, setTransfer] = React.useState<{ count: number; toUserId: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const name = member ? member.user.name || member.user.email : "";
  const others = project.members.filter((m) => m.id !== member?.id && m.role !== "CLIENT");

  const close = () => {
    onClose();
    setTransfer(null);
    setError(null);
  };
  const confirm = () => {
    if (!member) return;
    setError(null);
    remove.mutate(
      { memberId: member.id, transferToUserId: transfer?.toUserId || undefined },
      {
        onSuccess: close,
        onError: (err) => {
          if (err instanceof TransferRequiredError) setTransfer({ count: err.taskCount, toUserId: others[0]?.user.id ?? "" });
          else setError(err instanceof Error ? err.message : "Could not remove them.");
        },
      },
    );
  };

  return (
    <Dialog open={member !== null} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-md" data-testid="remove-member-dialog">
        <DialogHeader>
          <DialogTitle>Remove {name} from {project.name}?</DialogTitle>
          <DialogDescription>
            {transfer
              ? `${name} still has ${transfer.count} open ${transfer.count === 1 ? "task" : "tasks"} here. Choose who takes them over; then the seat is removed.`
              : "They lose access to this project's work. Their account stays; they can be added again later."}
          </DialogDescription>
        </DialogHeader>
        {transfer && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-to">Hand the tasks to</Label>
            <Select value={transfer.toUserId} onValueChange={(v) => setTransfer({ ...transfer, toUserId: v })}>
              <SelectTrigger id="transfer-to" className="w-full" data-testid="transfer-select">
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent position="popper">
                {others.map((m) => (
                  <SelectItem key={m.id} value={m.user.id}>
                    {m.user.name || m.user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {others.length === 0 && <p className="text-xs text-muted-foreground">There is nobody else on the project to take them.</p>}
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={remove.isPending || (transfer !== null && !transfer.toUserId)} data-testid="remove-member-submit">
            {remove.isPending ? "Removing…" : transfer ? "Hand over and remove" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Cancel invitation": the link in their email stops working. */
export function CancelInvitationDialog({
  projectId,
  invitation,
  onClose,
}: {
  projectId: string;
  invitation: ProjectInvitation | null;
  onClose: () => void;
}) {
  const cancel = useCancelInvitation(projectId);
  const [error, setError] = React.useState<string | null>(null);
  const who = invitation ? invitation.name || invitation.email : "";

  const close = () => {
    onClose();
    setError(null);
  };
  const confirm = () => {
    if (!invitation) return;
    setError(null);
    cancel.mutate(invitation.id, { onSuccess: close, onError: (err) => setError(err instanceof Error ? err.message : "Could not cancel it.") });
  };

  return (
    <Dialog open={invitation !== null} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-sm" data-testid="cancel-invitation-dialog">
        <DialogHeader>
          <DialogTitle>Cancel the invitation to {who}?</DialogTitle>
          <DialogDescription>The link in their email stops working. You can invite them again any time.</DialogDescription>
        </DialogHeader>
        {error && <ErrorNote>{error}</ErrorNote>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep it</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={cancel.isPending} data-testid="cancel-invitation-submit">
            {cancel.isPending ? "Cancelling…" : "Cancel invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
