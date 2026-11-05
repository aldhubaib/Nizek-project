"use client";

import { format } from "date-fns";
import { Mail } from "lucide-react";

import { Chip, DetailSection, Fact, RecordRow, RecordRowSkeleton } from "@/next-ui/blocks";
import { useProjectInvitations, type ProjectDetail, type ProjectInvitation } from "@/next-ui/data/projects";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project manager",
  MEMBER: "Member",
  CLIENT: "Client",
};

const ROLE_ORDER: Record<string, number> = { ADMIN: 0, PROJECT_MANAGER: 1, MEMBER: 2, CLIENT: 3 };

type Member = ProjectDetail["members"][number];

/** Admins and managers first, then by name. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort(
    (a, b) =>
      (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
      (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email),
  );
}

/**
 * Who is on the project: every member with their role and what they may do, and the people
 * invited who have not joined yet. Inviting, removing and changing roles are not built here yet.
 */
export function TeamView({ project: p, now }: { project: ProjectDetail; now: Date }) {
  const invitations = useProjectInvitations(p.id);
  const members = sortMembers(p.members);
  const pending = invitations.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <DetailSection title="Members" meta={members.length} className="border-t-0 pt-0" testId="team-members">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody on this project yet.</p>
        ) : (
          <div className="flex flex-col gap-2" role="list">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Invited" meta={invitations.isPending ? undefined : pending.length} testId="team-invited">
        {invitations.isPending ? (
          <RecordRowSkeleton />
        ) : invitations.error ? (
          <p className="text-sm text-muted-foreground">Invitations are not available right now.</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <div className="flex flex-col gap-2" role="list">
            {pending.map((i) => (
              <InvitationRow key={i.id} invitation={i} now={now} />
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

function MemberRow({ member: m }: { member: Member }) {
  const name = m.user.name || m.user.email;
  const role = m.projectRole?.name ?? ROLE_LABEL[m.role] ?? m.role;
  return (
    <RecordRow
      leading={
        <Avatar className="size-10">
          {m.user.imageUrl && <AvatarImage src={m.user.imageUrl} alt="" />}
          <AvatarFallback>{name.trim().charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      }
      title={name}
      description={m.user.name ? m.user.email : undefined}
      meta={
        <>
          <Chip>{role}</Chip>
          {m.projectRole && m.projectRole.name !== ROLE_LABEL[m.role] && <Fact>{ROLE_LABEL[m.role] ?? m.role}</Fact>}
          {m.canInviteMembers && <Fact>Can invite</Fact>}
          {m.canInviteClients && <Fact>Can invite clients</Fact>}
          {m.canBypassProof && <Fact>Can bypass proof</Fact>}
          <Fact label="Since">{format(new Date(m.createdAt), "d MMM yyyy")}</Fact>
        </>
      }
    />
  );
}

function InvitationRow({ invitation: i, now }: { invitation: ProjectInvitation; now: Date }) {
  const role = i.projectRole?.name ?? ROLE_LABEL[i.role] ?? i.role;
  const expired = new Date(i.expiresAt).getTime() < now.getTime();
  return (
    <RecordRow
      leading={
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Mail className="size-4" />
        </span>
      }
      title={i.name || i.email}
      description={i.name ? i.email : undefined}
      muted={expired}
      meta={
        <>
          <Chip>{role}</Chip>
          {i.invitedBy.name && <Fact label="by">{i.invitedBy.name}</Fact>}
          <Fact label={expired ? "Expired" : "Expires"}>{format(new Date(i.expiresAt), "d MMM yyyy")}</Fact>
        </>
      }
    />
  );
}
