import { getDefaultQuestions } from "@/actions/default-question";
import { getTeams } from "@/actions/team";
import { DefaultQuestionsManager } from "@/components/settings/default-questions-manager";
import { TeamsManager } from "@/components/settings/teams-manager";

export default async function SettingsPage() {
  const [questions, teams] = await Promise.all([
    getDefaultQuestions(),
    getTeams(),
  ]);

  return (
    <div>
      <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Settings</h1>
      </div>
      <div className="px-6 py-6 max-w-2xl space-y-10">
        <TeamsManager teams={teams} />
        <div className="border-t border-border" />
        <DefaultQuestionsManager questions={questions} />
      </div>
    </div>
  );
}
