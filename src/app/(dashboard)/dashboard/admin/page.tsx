import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isClientUser } from "@/lib/client-chat";
import { getTeams, ensureDefaultTeams, getPendingInvitesForTeam, getTeamMembers, getPendingInvitations, getPendingTeamInvites, getProjectsWithRoles } from "@/actions/team";
import { getRoles } from "@/actions/role";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { getAgreementAdminView } from "@/actions/client-agreement";
import { getClientIssueTypes, getDefaultQuestions } from "@/actions/default-question";
import { getBrandingAssets } from "@/actions/branding";
import { getLoginPhotos } from "@/actions/login-photos";
import { getNotificationSound } from "@/actions/notification-sound-settings";
import { AdminPageClient } from "./admin-page-client";

export default async function AdminPage() {
  const user = await requireUser();
  if (isClientUser(user)) redirect("/dashboard/messages");
  if (user.systemRole !== "ADMIN") redirect("/dashboard");

  await ensureDefaultTeams();

  const [teams, pendingInvites, members, invitations, teamInvites, roles, prefixes, questions, clientIssueTypes, agreement, branding, loginPhotos, notificationSound, projectOptions] = await Promise.all([
    getTeams(),
    getPendingInvitesForTeam(),
    getTeamMembers(),
    getPendingInvitations(),
    getPendingTeamInvites(),
    getRoles(),
    getContractPrefixes(),
    getDefaultQuestions(),
    getClientIssueTypes(),
    getAgreementAdminView(),
    getBrandingAssets(),
    getLoginPhotos(),
    getNotificationSound(),
    getProjectsWithRoles(),
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
        clientIssueTypes={clientIssueTypes}
        agreement={agreement}
        branding={branding}
        loginPhotos={loginPhotos}
        notificationSound={notificationSound}
        projectOptions={projectOptions}
        currentUserId={user.id}
      />
    </Suspense>
  );
}
