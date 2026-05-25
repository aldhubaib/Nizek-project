"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Users, Shield, FolderKanban, FileText, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamsManager } from "@/components/settings/teams-manager";
import { TeamPageClient } from "@/app/(dashboard)/dashboard/team/team-page-client";
import { RolesManager } from "@/components/settings/roles-manager";
import { ContractPrefixManager } from "@/components/settings/contract-prefix-manager";
import { DefaultQuestionsManager } from "@/components/settings/default-questions-manager";

const TABS = [
  { id: "teams", label: "Teams", icon: FolderKanban },
  { id: "members", label: "Members", icon: Users },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "contracts", label: "Contracts", icon: FileText },
  { id: "questions", label: "Questions", icon: HelpCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  teams: any;
  pendingInvites: any;
  members: any;
  invitations: any;
  teamInvites: any;
  roles: any;
  prefixes: any;
  questions: any;
}

export function AdminPageClient({
  teams,
  pendingInvites,
  members,
  invitations,
  teamInvites,
  roles,
  prefixes,
  questions,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = (searchParams.get("tab") as TabId) || "teams";

  function setTab(tab: TabId) {
    router.push(`/dashboard/admin?tab=${tab}`, { scroll: false });
  }

  return (
    <div>
      <div className="h-12 flex items-center gap-6 px-6 border-b border-border shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 text-[13px] font-medium py-3 border-b-2 transition-colors shrink-0",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-6 py-6 max-w-3xl">
        {activeTab === "teams" && (
          <TeamsManager teams={teams} pendingInvites={pendingInvites} />
        )}
        {activeTab === "members" && (
          <TeamPageClient
            members={members}
            invitations={invitations}
            teamInvites={teamInvites}
            roles={roles}
            isAdmin={true}
          />
        )}
        {activeTab === "roles" && (
          <RolesManager roles={roles} />
        )}
        {activeTab === "contracts" && (
          <ContractPrefixManager prefixes={prefixes} />
        )}
        {activeTab === "questions" && (
          <DefaultQuestionsManager questions={questions} />
        )}
      </div>
    </div>
  );
}
