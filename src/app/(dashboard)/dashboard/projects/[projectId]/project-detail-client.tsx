"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverflowTabBar, type OverflowTabItem } from "@/components/overflow-tab-bar";
import { KanbanBoard } from "@/components/kanban/board-lazy";
import { MeetingNotesTab } from "@/components/project/meeting-notes-tab";
import { AssetsTab } from "@/components/project/assets-tab";
import { MemberList } from "@/components/team/member-list";
import { InviteMemberDialog } from "@/components/team/invite-member-dialog";
import { ProjectSettingsOverlay } from "@/components/project/project-settings-overlay";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { VaultTab } from "@/components/vault/vault-tab";
import { createPortal } from "react-dom";
import { getMeetingNotes } from "@/actions/meeting-note";
import { getAssets } from "@/actions/asset";
import { getProjectInvitations } from "@/actions/project";
import { getRoles } from "@/actions/role";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { getTeams } from "@/actions/team";
import { listProjectVaultCredentials, type VaultCredentialDTO } from "@/actions/vault";

import type { TaskQuestion } from "@/components/kanban/question-field";
import type { KanbanTask } from "@/store/kanban";
import Link from "next/link";
import { Users, KeyRound, Settings, Loader2, ArrowLeft } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const PROJECT_TAB_CLASS =
  "flex-none gap-1 px-2 group-data-horizontal/tabs:after:bottom-0";

export interface UserPermissions {
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  canInviteMembers: boolean;
  canInviteClients: boolean;
  allowedStages: string[];
  allowedTransitions: Record<string, string[]>;
  createStages: string[];
  modifyStages: string[];
  isAdmin: boolean;
  systemRole: string;
}

interface Contract {
  id: string;
  label: string | null;
  code: string | null;
  prefixId?: string | null;
  contractType: string;
  startDate: Date | null;
  endDate: Date | null;
  latePayment: boolean;
}

interface ProjectRole {
  id: string;
  name: string;
  isAdmin: boolean;
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  allowedStages: string | null;
  allowedTransitions: string | null;
  _count: { members: number };
}

interface Member {
  id: string;
  role: string;
  roleId: string | null;
  canInviteMembers: boolean;
  canInviteClients: boolean;
  projectRole: {
    id: string;
    name: string;
    isAdmin: boolean;
    canCreateTask: boolean;
    canModifyTask: boolean;
    canMoveTask: boolean;
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    imageUrl: string | null;
    systemRole?: string;
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  team?: { id: string; name: string } | null;
  contracts: Contract[];
  _count: { tasks: number; meetingNotes: number; assets: number };
  defaultClientReviewerId?: string | null;
  maxPipelineTasks?: number;
}

interface NoteHistoryEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
}

interface MeetingNote {
  id: string;
  title: string;
  content: string;
  date: Date;
  noteType: string;
  dueDate?: Date | string | null;
  workingDays?: number | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  roadmapStatus?: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; imageUrl: string | null };
  task: { id: string; title: string; taskNumber: number; taskType: string } | null;
  history?: NoteHistoryEntry[];
}

interface Asset {
  id: string;
  filename: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: Date;
  uploadedBy: { id: string; name: string | null };
}

interface ContractPrefixOption {
  id: string;
  prefix: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  invitedBy: { id: string; name: string | null; imageUrl: string | null };
  projectRole: { id: string; name: string; isAdmin: boolean } | null;
}

interface Props {
  project: Project;
  tasks: KanbanTask[];
  userRole: string;
  userPermissions: UserPermissions;
  isActive: boolean;
  questions: TaskQuestion[];
  members: Member[];
  currentUserId: string;
  isSystemAdmin?: boolean;
  isDeadlineTestProject?: boolean;
  allowedTaskTypes?: string[];
  activeContractType?: string | null;
  /** Separate Vault permission — not the same as project team access. */
  canAccessVault?: boolean;
}

function TabSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ProjectDetailClient({
  project,
  tasks,
  userRole,
  userPermissions,
  isActive,
  questions,
  members,
  currentUserId,
  isSystemAdmin = false,
  isDeadlineTestProject = false,
  allowedTaskTypes,
  activeContractType,
  canAccessVault = false,
}: Props) {
  const canEdit = userPermissions.canModifyTask || userPermissions.isAdmin;
  const isAdmin = userPermissions.isAdmin;
  const canManageTeam = userPermissions.canInviteMembers || userPermissions.canInviteClients;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTabState] = useState(searchParams.get("tab") ?? "board");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Lazy-loaded tab data
  const [notes, setNotes] = useState<MeetingNote[] | null>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [teamData, setTeamData] = useState<{ roles: ProjectRole[]; invitations: Invitation[] } | null>(null);
  const [vaultCredentials, setVaultCredentials] = useState<VaultCredentialDTO[] | null>(null);
  const [settingsData, setSettingsData] = useState<{ teams: Team[]; contractPrefixes: ContractPrefixOption[] } | null>(null);

  const [loadingNotes, startNotesTransition] = useTransition();
  const [loadingAssets, startAssetsTransition] = useTransition();
  const [loadingTeam, startTeamTransition] = useTransition();
  const [loadingVault, startVaultTransition] = useTransition();
  const [loadingSettings, startSettingsTransition] = useTransition();
  const [noteFullscreen, setNoteFullscreen] = useState(false);
  const noteBackRef = useRef<(() => void) | null>(null);

  const handleNoteFullscreen = useCallback((open: boolean, goBack?: () => void) => {
    setNoteFullscreen(open);
    noteBackRef.current = open && goBack ? goBack : null;
  }, []);

  const handleNotesChange = useCallback((updater: (prev: MeetingNote[]) => MeetingNote[]) => {
    setNotes((prev) => updater(prev ?? []));
  }, []);

  useEffect(() => {
    const wantsNotes =
      activeTab === "notes" ||
      activeTab === "roadmap" ||
      Boolean(searchParams.get("noteId"));
    if (wantsNotes && notes === null) {
      startNotesTransition(async () => {
        const data = await getMeetingNotes(project.id);
        setNotes(data as unknown as MeetingNote[]);
      });
    }
  }, [activeTab, notes, project.id, searchParams]);

  useEffect(() => {
    if (!notes) return;
    const noteId = searchParams.get("noteId");
    if (!noteId) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const tab = note.noteType === "DEADLINE" ? "roadmap" : "notes";
    if (activeTab !== tab) setActiveTab(tab);
  }, [notes, searchParams, activeTab]);

  useEffect(() => {
    if (activeTab === "assets" && assets === null) {
      startAssetsTransition(async () => {
        const data = await getAssets(project.id);
        setAssets(data as unknown as Asset[]);
      });
    }
  }, [activeTab, assets, project.id]);

  useEffect(() => {
    if (activeTab === "team" && teamData === null) {
      startTeamTransition(async () => {
        const [roles, invitations] = await Promise.all([
          getRoles(),
          getProjectInvitations(project.id),
        ]);
        setTeamData({ roles, invitations: invitations as unknown as Invitation[] });
      });
    }
  }, [activeTab, teamData, project.id]);

  useEffect(() => {
    if (activeTab === "vault" && canAccessVault && vaultCredentials === null) {
      startVaultTransition(async () => {
        const data = await listProjectVaultCredentials(project.id);
        setVaultCredentials(data);
      });
    }
  }, [activeTab, canAccessVault, vaultCredentials, project.id]);

  function handleOpenSettings() {
    setSettingsOpen(true);
    if (settingsData === null) {
      startSettingsTransition(async () => {
        const [teams, contractPrefixes] = await Promise.all([
          getTeams(),
          getContractPrefixes(),
        ]);
        setSettingsData({
          teams: teams.filter((t: any) => !t.isDefault),
          contractPrefixes,
        });
      });
    }
  }

  function setActiveTab(tab: string) {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  const roadmapCount = notes
    ? notes.filter((n) => n.noteType === "DEADLINE").length
    : 0;
  const notesCount = notes
    ? notes.filter((n) => n.noteType !== "DEADLINE").length
    : project._count.meetingNotes;
  const assetsCount = assets ? assets.length : project._count.assets;

  const projectTabs: OverflowTabItem<string>[] = [
    { id: "board", label: "Board" },
    { id: "roadmap", label: "Roadmap", count: roadmapCount },
    { id: "notes", label: "Notes", count: notesCount },
    { id: "assets", label: "Assets", count: assetsCount },
  ];

  return (
    <div>
      {!noteFullscreen && (canManageTeam || canAccessVault) && (
        <PageOverflowItems id="project-team-vault" order={50}>
          {canManageTeam && (
            <DropdownMenuItem onClick={() => setActiveTab("team")}>
              <Users className="h-4 w-4" />
              <span className="flex-1">Team</span>
              <span className="text-xs text-muted-foreground">
                {members.length + (teamData?.invitations.length ?? 0)}
              </span>
            </DropdownMenuItem>
          )}
          {canAccessVault && (
            <DropdownMenuItem onClick={() => setActiveTab("vault")}>
              <KeyRound className="h-4 w-4" />
              <span className="flex-1">Vault</span>
              {vaultCredentials && (
                <span className="text-xs text-muted-foreground">
                  {vaultCredentials.length}
                </span>
              )}
            </DropdownMenuItem>
          )}
        </PageOverflowItems>
      )}
      <PageOverflowItems id="project-settings" order={100}>
        <DropdownMenuItem onClick={handleOpenSettings}>
          <Settings className="h-4 w-4" />
          <span className="flex-1">Settings</span>
        </DropdownMenuItem>
      </PageOverflowItems>
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as string)}
        className={cn(
          "w-full min-w-0 gap-0",
          activeTab === "board" && !noteFullscreen && "lg:h-dvh lg:overflow-hidden",
        )}
      >
      <PageHeader hasMenu className="relative w-full min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-2">
        <div className="relative z-10 flex min-w-0 items-center gap-2.5">
          {noteFullscreen ? (
            <button
              type="button"
              onClick={() => noteBackRef.current?.()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Back to notes"
              aria-label="Back to notes"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/dashboard/projects"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Back to all projects"
              aria-label="Back to all projects"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          {project.logoUrl ? (
            <img
              src={project.logoUrl}
              alt={project.name}
              className="h-7 w-7 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15">
              <span className="text-xs font-bold text-primary">
                {project.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="max-w-[5.5rem] truncate text-s font-semibold sm:max-w-[9rem] lg:max-w-none">
            {project.name}
          </h1>
          {!isActive && (
            <span className="inline-flex items-center rounded-full border border-destructive/20 bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
              Expired
            </span>
          )}
        </div>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center lg:static lg:pointer-events-auto",
            noteFullscreen && "invisible",
          )}
        >
          <div className="pointer-events-auto">
            <OverflowTabBar
              items={projectTabs}
              value={activeTab}
              onChange={setActiveTab}
              mobileMaxVisible={1}
            />
          </div>
          <TabsList className="hidden">
            <TabsTrigger value="board" className={PROJECT_TAB_CLASS} />
            <TabsTrigger value="roadmap" className={PROJECT_TAB_CLASS} />
            <TabsTrigger value="notes" className={PROJECT_TAB_CLASS} />
            <TabsTrigger value="assets" className={PROJECT_TAB_CLASS} />
            {canManageTeam && <TabsTrigger value="team" className={PROJECT_TAB_CLASS} />}
            {canAccessVault && <TabsTrigger value="vault" className={PROJECT_TAB_CLASS} />}
          </TabsList>
        </div>
        <div aria-hidden className="hidden min-w-0 lg:block" />
      </PageHeader>

      <div
        className={cn(
          "min-w-0",
          noteFullscreen
            ? "px-0 py-0"
            : activeTab === "board"
              ? "flex flex-col px-app pt-4 pb-4 lg:min-h-0 lg:flex-1 lg:pb-0"
              : "px-app py-4",
        )}
      >
          <TabsContent value="board" className="flex min-h-0 flex-1 flex-col">
            <KanbanBoard
              initialTasks={tasks as unknown as KanbanTask[]}
              projectId={project.id}
              userRole={userRole}
              userPermissions={userPermissions}
              isProjectActive={isActive}
              questions={questions as unknown as (TaskQuestion & { taskType: string })[]}
              currentUserId={currentUserId}
              allowedTaskTypes={allowedTaskTypes}
              activeContractType={activeContractType}
              maxPipelineTasks={project.maxPipelineTasks}
            />
          </TabsContent>

          <TabsContent value="notes">
            {activeTab === "notes" && (loadingNotes || !notes ? (
              <TabSpinner />
            ) : (
              <MeetingNotesTab
                notes={notes as unknown as MeetingNote[]}
                projectId={project.id}
                canEdit={canEdit}
                currentUserId={currentUserId}
                isSystemAdmin={isSystemAdmin}
                isDeadlineTestProject={isDeadlineTestProject}
                allowedTaskTypes={allowedTaskTypes ?? []}
                activeContractType={activeContractType ?? null}
                isActive={isActive}
                section="notes"
                onFullscreenChange={handleNoteFullscreen}
                onNotesChange={handleNotesChange}
              />
            ))}
          </TabsContent>

          <TabsContent value="roadmap">
            {activeTab === "roadmap" && (loadingNotes || !notes ? (
              <TabSpinner />
            ) : (
              <MeetingNotesTab
                notes={notes as unknown as MeetingNote[]}
                projectId={project.id}
                canEdit={canEdit}
                currentUserId={currentUserId}
                isSystemAdmin={isSystemAdmin}
                isDeadlineTestProject={isDeadlineTestProject}
                allowedTaskTypes={allowedTaskTypes ?? []}
                activeContractType={activeContractType ?? null}
                isActive={isActive}
                section="roadmap"
                onFullscreenChange={handleNoteFullscreen}
                onNotesChange={handleNotesChange}
              />
            ))}
          </TabsContent>

          <TabsContent value="assets">
            {loadingAssets || !assets ? (
              <TabSpinner />
            ) : (
              <AssetsTab
                assets={assets as unknown as Asset[]}
                projectId={project.id}
                canEdit={canEdit}
              />
            )}
          </TabsContent>

          <TabsContent value="team">
            {loadingTeam || !teamData ? (
              <TabSpinner />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-s font-semibold">Team Members</h2>
                  {canManageTeam && (
                    <InviteMemberDialog
                      projectId={project.id}
                      roles={teamData.roles}
                      canInviteMembers={userPermissions.canInviteMembers}
                      canInviteClients={userPermissions.canInviteClients}
                    />
                  )}
                </div>
                <MemberList
                  members={members}
                  projectId={project.id}
                  currentUserRole={userRole}
                  currentUserId={currentUserId}
                  roles={teamData.roles}
                  invitations={teamData.invitations}
                  canManageMembers={userPermissions.canInviteMembers || userPermissions.canInviteClients}
                />
              </div>
            )}
          </TabsContent>

          {canAccessVault && (
            <TabsContent value="vault">
              {loadingVault || !vaultCredentials ? (
                <TabSpinner />
              ) : (
                <VaultTab projectId={project.id} credentials={vaultCredentials} />
              )}
            </TabsContent>
          )}

      </div>
      </Tabs>

      {settingsOpen && createPortal(
        <ProjectSettingsOverlay
          project={project}
          teams={settingsData?.teams ?? []}
          contractPrefixes={settingsData?.contractPrefixes ?? []}
          clientMembers={members
            .filter((m) => m.user.systemRole === "CLIENT")
            .map((m) => ({ id: m.user.id, name: m.user.name, imageUrl: m.user.imageUrl }))}
          isAdmin={isAdmin}
          onClose={() => { setSettingsOpen(false); router.refresh(); }}
        />,
        document.body
      )}
    </div>
  );
}
