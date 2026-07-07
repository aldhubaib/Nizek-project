import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTeams, ensureDefaultTeams, getPendingInvitesForTeam, getTeamMembers, getPendingInvitations, getPendingTeamInvites } from "@/actions/team";
import { getRoles } from "@/actions/role";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { getDefaultQuestions } from "@/actions/default-question";
import { getBrandingAssets } from "@/actions/branding";
import { getLoginPhotos } from "@/actions/login-photos";
import { AdminPageClient } from "./admin-page-client";

export default async function AdminPage() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") redirect("/dashboard");

  await ensureDefaultTeams();

  const [teams, pendingInvites, members, invitations, teamInvites, roles, prefixes, questions, branding, loginPhotos] = await Promise.all([
    getTeams(),
    getPendingInvitesForTeam(),
    getTeamMembers(),
    getPendingInvitations(),
    getPendingTeamInvites(),
    getRoles(),
    getContractPrefixes(),
    getDefaultQuestions(),
    getBrandingAssets(),
    getLoginPhotos(),
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
        branding={branding}
        loginPhotos={loginPhotos}
      />
    </Suspense>
  );
}
