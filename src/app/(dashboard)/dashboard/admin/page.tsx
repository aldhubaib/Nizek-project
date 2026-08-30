import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isClientUser } from "@/lib/client-chat";
import { getTeams, ensureDefaultTeams, getPendingInvitesForTeam, getTeamMembers, getPendingInvitations, getPendingTeamInvites } from "@/actions/team";
import { getRoles } from "@/actions/role";
import { getProjectOptions } from "@/actions/project";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { getAliases, getAliasUsage, getAliasStats } from "@/actions/alias";
import { getDefaultQuestions } from "@/actions/default-question";
import { getBrandingAssets } from "@/actions/branding";
import { getLoginPhotos } from "@/actions/login-photos";
import { getNotificationSound } from "@/actions/notification-sound-settings";
import { AdminPageClient } from "./admin-page-client";

export default async function AdminPage() {
  const user = await requireUser();
  if (isClientUser(user)) redirect("/dashboard/messages");
  if (user.systemRole !== "ADMIN") redirect("/dashboard");

  await ensureDefaultTeams();

  const [teams, pendingInvites, members, invitations, teamInvites, roles, prefixes, questions, aliases, aliasUsage, aliasStats, branding, loginPhotos, notificationSound, projectOptions] = await Promise.all([
    getTeams(),
    getPendingInvitesForTeam(),
    getTeamMembers(),
    getPendingInvitations(),
    getPendingTeamInvites(),
    getRoles(),
    getContractPrefixes(),
    getDefaultQuestions(),
    getAliases(),
    getAliasUsage(),
    getAliasStats(),
    getBrandingAssets(),
    getLoginPhotos(),
    getNotificationSound(),
    getProjectOptions(),
  ]);

  return (
    <Suspense>
      <AdminPageClient
        teams={teams}
        pendingInvites={pendingInvites}
        members={members}
        invitations={invitations}
        teamInvites={teamInvites}
        roles={roles}
        prefixes={prefixes}
        questions={questions}
        aliases={aliases}
        aliasUsage={aliasUsage}
        aliasStats={aliasStats}
        branding={branding}
        loginPhotos={loginPhotos}
        notificationSound={notificationSound}
        projectOptions={projectOptions}
        currentUserId={user.id}
      />
    </Suspense>
  );
}
