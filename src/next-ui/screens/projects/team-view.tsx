"use client";

import * as React from "react";
import { format } from "date-fns";
import { Briefcase, Building2, Mail, MailX, ShieldCheck, User, UserMinus, UserPen, UserPlus, Users, type LucideIcon } from "lucide-react";

import {
  Chip,
  Collection,
  DetailSection,
  Fact,
  NoMatch,
  RecordCard,
  RecordCardSkeleton,
  RecordMenu,
  RecordRow,
  RecordRowSkeleton,
} from "@/next-ui/blocks";
import { useProjectInvitations, type ProjectDetail, type ProjectInvitation } from "@/next-ui/data/projects";
import { filterGroup, optionsOf, usePageFilters } from "@/next-ui/patterns/filter-menu";
import { HeaderAction } from "@/next-ui/patterns/header-action";
import { ListTools } from "@/next-ui/patterns/list-tools";
import { usePageView } from "@/next-ui/patterns/view-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/next-ui/ui/dropdown-menu";

import type { ViewerRights } from "./project-screen";
import { AddPeopleDialog, CancelInvitationDialog, ChangeRoleDialog, RemoveMemberDialog } from "./team-dialogs";

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project manager",
  MEMBER: "Member",
  CLIENT: "Client",
};

const ROLE_ICON: Record<string, LucideIcon> = {
  ADMIN: ShieldCheck,
  PROJECT_MANAGER: Briefcase,
  MEMBER: User,
  CLIENT: Building2,
};

const ROLE_ORDER: Record<string, number> = { ADMIN: 0, PROJECT_MANAGER: 1, MEMBER: 2, CLIENT: 3 };

const WHO_OPTIONS = [
  { value: "members", label: "Members", icon: <Users /> },
  { value: "invited", label: "Invited", icon: <Mail /> },
];

type Member = ProjectDetail["members"][number];

/** Admins and managers first, then by name. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort(
    (a, b) =>
      (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
      (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email),
  );
}

/** The words a search over people looks through. */
function matches(query: string, ...parts: (string | null | undefined)[]): boolean {
  if (!query) return true;
  return parts.some((part) => part?.toLowerCase().includes(query));
}

type TeamRights = Pick<ViewerRights, "canManageTeam" | "canInviteMembers" | "canInviteClients">;

/** Nobody may touch anyone: the page as a reader sees it. */
export const READ_ONLY: TeamRights = { canManageTeam: false, canInviteMembers: false, canInviteClients: false };

/** Whether this viewer may change or remove this member: a client seat needs the client right, any other the member right. */
export function canManageMember(m: Pick<Member, "role"> & { user: { systemRole?: string | null } }, rights: TeamRights): boolean {
  const client = m.role === "CLIENT" || m.user.systemRole === "CLIENT";
  return client ? rights.canInviteClients : rights.canInviteMembers;
}

type Dialog = { kind: "add" } | { kind: "role"; member: Member } | { kind: "remove"; member: Member } | { kind: "cancel"; invitation: ProjectInvitation };

/**
 * Who is on the project: every member with their role and what they may do, and the people
 * invited who have not joined yet, as rows or as cards (the View menu). The Filter menu narrows
 * to members or invitations and to one role; the search is in the pane header. Someone allowed
 * to manage the team gets "Add people" in the header and, on each row, a menu to change the
 * role, remove the member or cancel the invitation (`team-dialogs.tsx`).
 */
export function TeamView({ project: p, now, rights = READ_ONLY }: { project: ProjectDetail; now: Date; rights?: TeamRights }) {
  const invitations = useProjectInvitations(p.id);
  const filters = usePageFilters(`team:${p.id}`);
  const view = usePageView("team");
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const closeDialog = React.useCallback(() => setDialog(null), []);
  const query = search.trim().toLowerCase();

  const everyone = React.useMemo(
    () => [...p.members.map((m) => m.role), ...(invitations.data ?? []).map((i) => i.role)].map((role) => ({ role })),
    [p.members, invitations.data],
  );
  const groups = React.useMemo(
    () => [
      filterGroup(filters, "who", WHO_OPTIONS),
      filterGroup(
        filters,
        "role",
        optionsOf(
          everyone,
          (r) => r.role,
          (v) => {
            const Icon = ROLE_ICON[v] ?? User;
            return { label: ROLE_LABEL[v] ?? v, icon: <Icon /> };
          },
          Object.keys(ROLE_LABEL),
        ),
        "Role",
      ),
    ],
    [everyone, filters],
  );

  const members = sortMembers(p.members).filter(
    (m) => filters.passes("role", m.role) && matches(query, m.user.name, m.user.email, m.projectRole?.name, ROLE_LABEL[m.role]),
  );
  const pending = (invitations.data ?? []).filter(
    (i) => filters.passes("role", i.role) && matches(query, i.name, i.email, i.projectRole?.name, ROLE_LABEL[i.role]),
  );
  const who = filters.valueOf("who");
  const isFiltered = filters.active || query !== "";
  const clear = () => {
    filters.clear();
    setSearch("");
  };
  const showMembers = who !== "invited" && (!isFiltered || members.length > 0);
  const showInvited = who !== "members" && (!isFiltered || pending.length > 0 || invitations.isPending);
  const layout = view.cards ? "grid" : "rows";
  const skeleton = view.cards ? <RecordCardSkeleton /> : <RecordRowSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <ListTools
        what="people"
        search={search}
        onSearch={setSearch}
        groups={groups}
        view={view}
        action={rights.canManageTeam && <HeaderAction label="Add people" icon={<UserPlus />} onClick={() => setDialog({ kind: "add" })} data-testid="add-people-button" />}
      />

      {showMembers && (
        <DetailSection title="Members" meta={members.length} className="border-t-0 pt-0" testId="team-members">
          <Collection
            layout={layout}
            min={view.min}
            items={members}
            getKey={(m) => m.id}
            skeleton={skeleton}
            empty={{
              icon: Users,
              title: "Nobody on this project yet",
              description: rights.canManageTeam ? "Use “Add people” above to bring in the team." : undefined,
            }}
            render={(m) => (
              <MemberItem
                member={m}
                cards={view.cards}
                menu={
                  canManageMember(m, rights) ? (
                    <RecordMenu contentClassName="min-w-48">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "role", member: m })}>
                        <UserPen />
                        Change role
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "remove", member: m })}>
                        <UserMinus />
                        Remove from project
                      </DropdownMenuItem>
                    </RecordMenu>
                  ) : undefined
                }
              />
            )}
          />
        </DetailSection>
      )}

      {showInvited && (
        <DetailSection
          title="Invited"
          meta={invitations.isPending ? undefined : pending.length}
          className={showMembers ? undefined : "border-t-0 pt-0"}
          testId="team-invited"
        >
          {invitations.error ? (
            <p className="text-sm text-muted-foreground">Invitations are not available right now.</p>
          ) : (
            <Collection
              layout={layout}
              min={view.min}
              items={pending}
              isPending={invitations.isPending}
              skeletonCount={1}
              getKey={(i) => i.id}
              skeleton={skeleton}
              empty={{ icon: Mail, title: "No pending invitations" }}
              render={(i) => (
                <InvitationItem
                  invitation={i}
                  now={now}
                  cards={view.cards}
                  menu={
                    rights.canManageTeam ? (
                      <RecordMenu contentClassName="min-w-48">
                        <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "cancel", invitation: i })}>
                          <MailX />
                          Cancel invitation
                        </DropdownMenuItem>
                      </RecordMenu>
                    ) : undefined
                  }
                />
              )}
            />
          )}
        </DetailSection>
      )}

      {!showMembers && !showInvited && <NoMatch noun="people" onClear={clear} />}

      {rights.canManageTeam && (
        <>
          <AddPeopleDialog projectId={p.id} open={dialog?.kind === "add"} onOpenChange={(open) => !open && closeDialog()} rights={rights} />
          <ChangeRoleDialog projectId={p.id} member={dialog?.kind === "role" ? dialog.member : null} rights={rights} onClose={closeDialog} />
          <RemoveMemberDialog projectId={p.id} project={p} member={dialog?.kind === "remove" ? dialog.member : null} onClose={closeDialog} />
          <CancelInvitationDialog projectId={p.id} invitation={dialog?.kind === "cancel" ? dialog.invitation : null} onClose={closeDialog} />
        </>
      )}
    </div>
  );
}

function PersonAvatar({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  return (
    <Avatar className={className}>
      {imageUrl && <AvatarImage src={imageUrl} alt="" />}
      <AvatarFallback>{name.trim().charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function MemberItem({ member: m, cards, menu }: { member: Member; cards: boolean; menu?: React.ReactNode }) {
  const name = m.user.name || m.user.email;
  const role = m.projectRole?.name ?? ROLE_LABEL[m.role] ?? m.role;
  const meta = (
    <>
      <Chip>{role}</Chip>
      {m.projectRole && m.projectRole.name !== ROLE_LABEL[m.role] && <Fact>{ROLE_LABEL[m.role] ?? m.role}</Fact>}
      {m.canInviteMembers && <Fact>Can invite</Fact>}
      {m.canInviteClients && <Fact>Can invite clients</Fact>}
      {m.canBypassProof && <Fact>Uploads videos for others</Fact>}
      <Fact label="Since">{format(new Date(m.createdAt), "d MMM yyyy")}</Fact>
    </>
  );
  const description = m.user.name ? m.user.email : undefined;
  if (cards) {
    return (
      <RecordCard
        media={<PersonAvatar name={name} imageUrl={m.user.imageUrl} className="size-16 text-xl" />}
        title={name}
        description={description}
        meta={meta}
        menu={menu}
        testId="team-member"
      />
    );
  }
  return (
    <RecordRow
      leading={<PersonAvatar name={name} imageUrl={m.user.imageUrl} className="size-10" />}
      title={name}
      description={description}
      meta={meta}
      menu={menu}
      testId="team-member"
    />
  );
}

function InvitationItem({ invitation: i, now, cards, menu }: { invitation: ProjectInvitation; now: Date; cards: boolean; menu?: React.ReactNode }) {
  const role = i.projectRole?.name ?? ROLE_LABEL[i.role] ?? i.role;
  const expired = new Date(i.expiresAt).getTime() < now.getTime();
  const meta = (
    <>
      <Chip>{role}</Chip>
      {i.invitedBy.name && <Fact label="by">{i.invitedBy.name}</Fact>}
      <Fact label={expired ? "Expired" : "Expires"}>{format(new Date(i.expiresAt), "d MMM yyyy")}</Fact>
    </>
  );
  const description = i.name ? i.email : undefined;
  if (cards) {
    return (
      <RecordCard
        media={<Mail className="size-10 text-muted-foreground" />}
        title={i.name || i.email}
        description={description}
        meta={meta}
        muted={expired}
        menu={menu}
        testId="team-invitation"
      />
    );
  }
  return (
    <RecordRow
      leading={
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Mail className="size-4" />
        </span>
      }
      title={i.name || i.email}
      description={description}
      muted={expired}
      meta={meta}
      menu={menu}
      testId="team-invitation"
    />
  );
}
