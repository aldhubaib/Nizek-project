import { getDefaultQuestions } from "@/actions/default-question";
import { getTeams, getOrCreateDefaultTeam, getPendingInvitesForTeam } from "@/actions/team";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { DefaultQuestionsManager } from "@/components/settings/default-questions-manager";
import { TeamsManager } from "@/components/settings/teams-manager";
import { ContractPrefixManager } from "@/components/settings/contract-prefix-manager";

export default async function SettingsPage() {
  await getOrCreateDefaultTeam();

  const [questions, teams, prefixes, pendingInvites] = await Promise.all([
    getDefaultQuestions(),
    getTeams(),
    getContractPrefixes(),
    getPendingInvitesForTeam(),
  ]);

  return (
    <div>
      <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Settings</h1>
      </div>
      <div className="px-6 py-6 max-w-2xl space-y-10">
        <TeamsManager teams={teams} pendingInvites={pendingInvites} />
        <div className="border-t border-border" />
        <ContractPrefixManager prefixes={prefixes} />
        <div className="border-t border-border" />
        <DefaultQuestionsManager questions={questions} />
      </div>
    </div>
  );
}
