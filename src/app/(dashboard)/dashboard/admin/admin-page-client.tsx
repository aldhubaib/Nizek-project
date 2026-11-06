"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Shield,
  FolderKanban,
  FileText,
  HelpCircle,
  ChevronRight,
  Image as ImageIcon,
  LogIn,
  Volume2,
  BellRing,
  PieChart,
  KeyRound,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TeamsManager } from "@/components/settings/teams-manager";
import { TeamPageClient } from "@/app/(dashboard)/dashboard/team/team-page-client";
import { RolesManager } from "@/components/settings/roles-manager";
import { ContractPrefixManager } from "@/components/settings/contract-prefix-manager";
import { DefaultQuestionsManager } from "@/components/settings/default-questions-manager";
import { AppLogoClient } from "./app-logo-client";
import { LoginSettingsClient } from "./login-settings-client";
import { NotificationSoundClient } from "./notification-sound-client";
import { NotificationStatusClient } from "./notification-status-client";
import {
  ClientAgreementManager,
  type AgreementFullscreen,
} from "@/components/settings/client-agreement-manager";
import { EquityAccessManager } from "@/components/settings/equity-access-manager";
import { VaultAccessManager } from "@/components/settings/vault-access-manager";
import type { AgreementAdminView } from "@/actions/client-agreement";
import type { BrandingAssetDTO } from "@/actions/branding";
import type { LoginPhotoDTO } from "@/actions/login-photos";
import type { NotificationSoundDTO } from "@/actions/notification-sound-settings";
import type { BrandingSlotId } from "@/lib/branding-slots";
import type { TaskType } from "@/generated/prisma/client";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { PageBody } from "@/components/page-body";
import { cn } from "@/lib/utils";

type TabId =
  | "teams"
  | "members"
  | "roles"
  | "contracts"
  | "client-agreement"
  | "questions"
  | "app-logo"
  | "login"
  | "notification-sound"
  | "push-health"
  | "notification-status"
  | "equity-access"
  | "vault-access";

type SettingsItem = {
  id: TabId;
  label: string;
  icon: LucideIcon;
  desc: string;
};

const SECTIONS: { group: string; items: SettingsItem[] }[] = [
  {
    group: "Team & Roles",
    items: [
      {
        id: "teams",
        label: "Teams",
        icon: FolderKanban,
        desc: "Organize members into teams and manage access.",
      },
      {
        id: "members",
        label: "Members",
        icon: Users,
        desc: "Invite people to the system and manage members.",
      },
      {
        id: "roles",
        label: "Role presets",
        icon: Shield,
        desc: "The roles a new project starts with. Each project edits its own copy in its settings.",
      },
      {
        id: "client-agreement",
        label: "Client Agreement",
        icon: ScrollText,
        desc: "The agreement clients must accept before using their chat, its versions, and who has agreed.",
      },
    ],
  },
  {
    group: "Projects",
    items: [
      {
        id: "questions",
        label: "Questions",
        icon: HelpCircle,
        desc: "Manage default questions added to new tasks.",
      },
      {
        id: "contracts",
        label: "Contracts",
        icon: FileText,
        desc: "Configure contract number prefixes.",
      },
    ],
  },
  {
    group: "Appearance",
    items: [
      {
        id: "app-logo",
        label: "App Logo",
        icon: ImageIcon,
        desc: "Upload favicon, PWA icons, web logo, and social share image.",
      },
      {
        id: "login",
        label: "Login Page",
        icon: LogIn,
        desc: "Add photos shown on the sign-in page's scrolling gallery.",
      },
      {
        id: "notification-sound",
        label: "Notification Sound",
        icon: Volume2,
        desc: "Upload a custom sound played when people receive notifications.",
      },
    ],
  },
  {
    group: "Monitoring",
    items: [
      {
        id: "notification-status",
        label: "Member Notifications",
        icon: BellRing,
        desc: "Who has notifications on or off (website and app), whether their last notification was opened, and push delivery health.",
      },
      {
        id: "equity-access",
        label: "Equity Access",
        icon: PieChart,
        desc: "Choose who can open the private Equity module.",
      },
      {
        id: "vault-access",
        label: "Vault Access",
        icon: KeyRound,
        desc: "Choose who can open each project's password vault.",
      },
    ],
  },
];

const ITEMS = SECTIONS.flatMap((s) => s.items);

interface Props {
  teams: any;
  pendingInvites: any;
  members: any;
  invitations: any;
  teamInvites: any;
  roles: any;
  prefixes: any;
  questions: any;
  clientIssueTypes: TaskType[];
  agreement: AgreementAdminView;
  branding: Partial<Record<BrandingSlotId, BrandingAssetDTO>>;
  loginPhotos: LoginPhotoDTO[];
  notificationSound: NotificationSoundDTO;
  /** Every project with its own roles, for the members tab's project pickers. */
  projectOptions: { id: string; name: string; roles: { id: string; name: string; isAdmin: boolean }[] }[];
  currentUserId?: string;
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
  clientIssueTypes,
  agreement,
  branding,
  loginPhotos,
  notificationSound,
  projectOptions,
  currentUserId,
}: Props) {
  const searchParams = useSearchParams();
  // Set by the agreement tab while it has a version open, so the header can
  // point back at its list instead of out to Settings.
  const [agreementDoc, setAgreementDoc] = useState<AgreementFullscreen>(null);
  const rawTab = searchParams.get("tab") as TabId | null;
  // Push Health folded into Member Notifications; old links keep working.
  const activeTab = rawTab === "push-health" ? "notification-status" : rawTab;
  const active = ITEMS.find((i) => i.id === activeTab) ?? null;

  // Settings hub — grouped tiles, shown when no section is selected.
  if (!active) {
    return (
      <div>
        <PageHeader>
          <PageName>Settings</PageName>
        </PageHeader>
        <PageBody className="mx-auto max-w-2xl space-y-8 py-8">
        {SECTIONS.map((section) => (
          <section key={section.group} className="space-y-3">
            <div className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {section.group}
            </div>
            <div className="space-y-3">
              {section.items.map((item) => (
                <Tile key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
        </PageBody>
      </div>
    );
  }

  // Detail view — the selected section's manager with a back link to the hub.
  return (
    <div>
      {/* Tabs that park a button in the top-right chrome need the extra room. */}
      <PageHeader
        hasMenu={
          active.id === "members" || !!agreementDoc
        }
      >
        {/*
          An open agreement version takes the header over, the way a note does
          on a project: back goes to the list of versions, not out to Settings.
        */}
        {agreementDoc ? (
          <>
            <PageBackButton onClick={agreementDoc.goBack} label="Back to versions" />
            <PageBreadcrumb
              items={[
                { label: "Settings", href: "/dashboard/admin" },
                { label: active.label, onClick: agreementDoc.goBack },
                { label: agreementDoc.title },
              ]}
            />
          </>
        ) : (
          <>
            <PageBackButton href="/dashboard/admin" label="Back to settings" />
            <PageBreadcrumb
              items={[
                { label: "Settings", href: "/dashboard/admin" },
                { label: active.label },
              ]}
            />
          </>
        )}
      </PageHeader>

      {/* An open version brings its own centred column and padding, so this is
          not a PageBody: the gutter has to come and go with the branch, and
          PageBody applies it unconditionally. */}
      <div
        className={cn(
          "min-w-0",
          agreementDoc
            ? "max-w-full"
            : active.id === "members"
              ? "max-w-full px-app py-4"
              : "max-w-3xl px-app py-6",
        )}
      >
        {active.id === "teams" && (
          <TeamsManager teams={teams} pendingInvites={pendingInvites} />
        )}
        {active.id === "members" && (
          <TeamPageClient
            members={members}
            invitations={invitations}
            teamInvites={teamInvites}
            workspaceTeams={(teams ?? [])
              .filter((t: { isDefault: boolean }) => !t.isDefault)
              .map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))}
            projectOptions={projectOptions}
            isAdmin={true}
            currentUserId={currentUserId}
          />
        )}
        {active.id === "roles" && <RolesManager roles={roles} />}
        {active.id === "contracts" && (
          <ContractPrefixManager prefixes={prefixes} />
        )}
        {active.id === "client-agreement" && (
          <ClientAgreementManager
            view={agreement}
            onFullscreenChange={setAgreementDoc}
          />
        )}
        {active.id === "questions" && (
          <DefaultQuestionsManager
            questions={questions}
            clientIssueTypes={clientIssueTypes}
          />
        )}
        {active.id === "app-logo" && <AppLogoClient assets={branding} />}
        {active.id === "login" && (
          <LoginSettingsClient photos={loginPhotos} />
        )}
        {active.id === "notification-sound" && (
          <NotificationSoundClient sound={notificationSound} />
        )}
        {active.id === "notification-status" && (
          <NotificationStatusClient
            initialView={rawTab === "push-health" ? "health" : "members"}
          />
        )}
        {active.id === "equity-access" && <EquityAccessManager />}
        {active.id === "vault-access" && <VaultAccessManager />}
      </div>
    </div>
  );
}

function Tile({ item }: { item: SettingsItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={`/dashboard/admin?tab=${item.id}`}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface p-4 transition-colors hover:border-border"
    >
      <div className="grid h-10 w-10 place-items-center rounded-md bg-black text-white">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{item.label}</div>
        <div className="text-s text-muted-foreground">{item.desc}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
