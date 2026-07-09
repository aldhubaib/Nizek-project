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
  ArrowLeft,
  Image as ImageIcon,
  LogIn,
  Volume2,
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
import type { BrandingAssetDTO } from "@/actions/branding";
import type { LoginPhotoDTO } from "@/actions/login-photos";
import type { NotificationSoundDTO } from "@/actions/notification-sound-settings";
import type { BrandingSlotId } from "@/lib/branding-slots";

type TabId =
  | "teams"
  | "members"
  | "roles"
  | "contracts"
  | "questions"
  | "app-logo"
  | "login"
  | "notification-sound";

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
  branding: Partial<Record<BrandingSlotId, BrandingAssetDTO>>;
  loginPhotos: LoginPhotoDTO[];
  notificationSound: NotificationSoundDTO;
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
  branding,
  loginPhotos,
  notificationSound,
}: Props) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") as TabId | null;
  const active = ITEMS.find((i) => i.id === activeTab) ?? null;

  // Settings hub — grouped tiles, shown when no section is selected.
  if (!active) {
    return (
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
        <h1 className="text-lg font-semibold">Settings</h1>
        {SECTIONS.map((section) => (
          <section key={section.group} className="space-y-3">
            <div className="px-1 text-tiny font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
    );
  }

  // Detail view — the selected section's manager with a back link to the hub.
  return (
    <div>
      <div className="h-12 flex items-center gap-3 px-6 pr-14 border-b border-border shrink-0">
        <Link
          href="/dashboard/admin"
          className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Settings
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          <active.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
          {active.label}
        </span>
      </div>

      <div className="px-6 py-6 max-w-3xl">
        {active.id === "teams" && (
          <TeamsManager teams={teams} pendingInvites={pendingInvites} />
        )}
        {active.id === "members" && (
          <TeamPageClient
            members={members}
            invitations={invitations}
            teamInvites={teamInvites}
            roles={roles}
            isAdmin={true}
          />
        )}
        {active.id === "roles" && <RolesManager roles={roles} />}
        {active.id === "contracts" && (
          <ContractPrefixManager prefixes={prefixes} />
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
        <div className="text-xs text-muted-foreground">{item.desc}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
