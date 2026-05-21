import { getTeamMembers, getPendingInvitations } from "@/actions/team";
import { requireUser } from "@/lib/auth";
import { TeamPageClient } from "./team-page-client";

export default async function TeamPage() {
  const user = await requireUser();
  const [members, invitations] = await Promise.all([
    getTeamMembers(),
    getPendingInvitations(),
  ]);

  return (
    <div>
      <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Team</h1>
      </div>
      <div className="px-6 py-6 max-w-3xl">
        <TeamPageClient
          members={members}
          invitations={invitations}
          isAdmin={user.systemRole === "ADMIN"}
        />
      </div>
    </div>
  );
}
