import { Settings } from "lucide-react";
import { getDefaultQuestions } from "@/actions/default-question";
import { DefaultQuestionsManager } from "@/components/settings/default-questions-manager";

export default async function SettingsPage() {
  const questions = await getDefaultQuestions();

  return (
    <div>
      <div className="h-12 flex items-center px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Settings</h1>
      </div>
      <div className="px-6 py-6 max-w-2xl">
        <DefaultQuestionsManager questions={questions} />
      </div>
    </div>
  );
}
