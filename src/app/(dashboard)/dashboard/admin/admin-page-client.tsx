"use client";

import Link from "next/link";
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
  ClipboardCheck,
  PieChart,
  Coins,
  KeyRound,
  UserRoundSearch,
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
import { AliasManager } from "@/components/settings/alias-manager";
import { AuditAccessManager } from "@/components/settings/audit-access-manager";
import { EquityAccessManager } from "@/components/settings/equity-access-manager";
import { CurrencyRateManager } from "@/components/settings/currency-rate-manager";
import { VaultAccessManager } from "@/components/settings/vault-access-manager";
import type { AliasDTO, AliasStatsDTO, AliasUsageDTO } from "@/actions/alias";
import type { BrandingAssetDTO } from "@/actions/branding";
import type { LoginPhotoDTO } from "@/actions/login-photos";
import type { NotificationSoundDTO } from "@/actions/notification-sound-settings";
import type { BrandingSlotId } from "@/lib/branding-slots";
import { PageHeader, PageBackButton, PageName } from "@/components/page-header";
import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { cn } from "@/lib/utils";

type TabId =
  | "teams"
  | "members"
  | "roles"
  | "contracts"
  | "aliases"
  | "questions"
  | "app-logo"
  | "login"
  | "notification-sound"
  | "push-health"
  | "notification-status"
  | "audit-access"
  | "equity-access"
  | "exchange-rates"
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
        label: "Roles",
        icon: Shield,
        desc: "Define roles and permissions across the system.",
      },
      {
        id: "aliases",
        label: "Aliases",
        icon: UserRoundSearch,
        desc: "Alias names and photos shown to clients instead of real staff identities.",
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
        id: "audit-access",
        label: "Audit Access",
        icon: ClipboardCheck,
        desc: "Choose who can audit which teams' flagged tasks.",
      },
      {
        id: "equity-access",
        label: "Equity Access",
        icon: PieChart,
        desc: "Choose who can open the private Equity module.",
      },
      {
        id: "exchange-rates",
        label: "Exchange Rates",
        icon: Coins,
        desc: "What each currency is worth, for totalling financial figures across projects.",
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
  aliases: AliasDTO[];
  aliasUsage: AliasUsageDTO[];
  aliasStats: AliasStatsDTO;
  branding: Partial<Record<BrandingSlotId, BrandingAssetDTO>>;
  loginPhotos: LoginPhotoDTO[];
  notificationSound: NotificationSoundDTO;
  projectOptions: { id: string; name: string }[];
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
  aliases,
  aliasUsage,
  aliasStats,
  branding,
  loginPhotos,
  notificationSound,
  projectOptions,
  currentUserId,
}: Props) {
  const searchParams = useSearchParams();
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
        <div className="mx-auto max-w-2xl space-y-8 px-app py-8">
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
        </div>
      </div>
    );
  }

  // Detail view — the selected section's manager with a back link to the hub.
  return (
    <div>
      {/* Tabs that park a button in the top-right chrome need the extra room. */}
      <PageHeader hasMenu={active.id === "members" || active.id === "aliases"}>
        <PageBackButton href="/dashboard/admin" label="Back to settings" />
        <PageBreadcrumb
          items={[
            { label: "Settings", href: "/dashboard/admin" },
            { label: active.label },
          ]}
        />
      </PageHeader>

      <div className={cn("min-w-0 px-app", active.id === "members" ? "max-w-full py-4" : "py-6 max-w-3xl")}>
        {active.id === "teams" && (
          <TeamsManager teams={teams} pendingInvites={pendingInvites} />
        )}
        {active.id === "members" && (
          <TeamPageClient
            members={members}
            invitations={invitations}
            teamInvites={teamInvites}
            roles={roles}
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
        {active.id === "aliases" && (
          <AliasManager aliases={aliases} usage={aliasUsage} stats={aliasStats} />
        )}
        {active.id === "questions" && (
          <DefaultQuestionsManager questions={questions} />
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
        {active.id === "audit-access" && <AuditAccessManager />}
        {active.id === "equity-access" && <EquityAccessManager />}
        {active.id === "exchange-rates" && <CurrencyRateManager />}
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
