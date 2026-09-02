"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverflowTabBar, type OverflowTabItem } from "@/components/overflow-tab-bar";
import { MeetingNotesTab } from "@/components/project/meeting-notes-tab";
import { SprintsTab } from "@/components/project/sprints-tab";
import { CompletedSprintsTab } from "@/components/project/completed-sprints-tab";
import { AssetsTab } from "@/components/project/assets-tab";
import { MemberList } from "@/components/team/member-list";
import { InviteMemberDialog } from "@/components/team/invite-member-dialog";
import { ProjectSettingsOverlay } from "@/components/project/project-settings-overlay";
import { PageOverflowItems } from "@/components/page-overflow-menu";
import { VaultTab } from "@/components/vault/vault-tab";
import { BoardTab } from "@/components/boards/board-tab";
import { createPortal } from "react-dom";
import { getMeetingNotes } from "@/actions/meeting-note";
import { getAssets } from "@/actions/asset";
import { getProjectInvitations, getProjectMembers } from "@/actions/project";
import { getRoles } from "@/actions/role";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { getTeams } from "@/actions/team";
import { listProjectVaultCredentials, type VaultCredentialDTO } from "@/actions/vault";
import { listSprints, type SprintDTO } from "@/actions/sprint";

import type { TaskQuestion } from "@/components/kanban/question-field";
import { useKanbanStore, type KanbanTask } from "@/store/kanban";
import { Users, KeyRound, Settings, Loader2, Check } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge, normalizeProjectTab } from "@/lib/task-label";
import { PageHeader, PageBackButton } from "@/components/page-header";
import { PageHeaderActions } from "@/components/page-header-actions";
import { AddButton } from "@/components/add-button";
import { PageBreadcrumb } from "@/components/page-breadcrumb";

const PROJECT_TAB_CLASS =
  "flex-none gap-1 px-2 group-data-horizontal/tabs:after:bottom-0";

export interface UserPermissions {
  canCreateTask: boolean;
  canModifyTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canDeclineTask: boolean;
  canCreateSprintPlanning: boolean;
  canStartSprint: boolean;
  canEndSprint: boolean;
  canDeleteSprint: boolean;
  canInviteMembers: boolean;
  canInviteClients: boolean;
  allowedStages: string[];
  allowedTransitions: Record<string, string[]>;
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
  isClient?: boolean;
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
  canBypassProof: boolean;
  showRealName?: boolean;
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
    excludeFromAlias?: boolean;
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
  internalReviewRoleId?: string | null;
  internalReviewUserId?: string | null;
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
  name: string | null;
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
  /**
   * Whether this project runs a board alongside its sprints, and this viewer
   * may open it. The board is a separate system with its own columns, card
   * types and roles; a project without one shows exactly the tabs it always did.
   */
  hasBoard?: boolean;
  /**
   * Whether a board has been added at all, and whether it is switched on. Only
   * project settings cares: it needs "hidden" and "never added" to offer
   * different controls. Use `hasBoard` for anything that renders the board.
   */
  boardExists?: boolean;
  boardEnabled?: boolean;
  /**
   * Whether this project runs sprints. False hides the Road map and Active
   * sprint tabs and the New task button, for a project tracked on a board
   * instead. Nothing is deleted — turning it back on restores the tabs.
   */
  sprintsEnabled?: boolean;
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
  hasBoard = false,
  boardExists = false,
  boardEnabled = false,
  sprintsEnabled = true,
}: Props) {
  const canEdit = userPermissions.canModifyTask || userPermissions.isAdmin;
  const isAdmin = userPermissions.isAdmin;
  const canCreateTask = userPermissions.isAdmin || userPermissions.canCreateTask;
  const canManageTeam = userPermissions.canInviteMembers || userPermissions.canInviteClients;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requestedTab, setActiveTabState] = useState(() => {
    const tab = searchParams.get("tab") ?? "roadmap";
    return normalizeProjectTab(tab);
  });

  // Which tabs this project actually offers. Sprints and the board are both
  // optional now, so a `?tab=` from a bookmark or a task's back link can name
  // one that is no longer there.
  const availableTabs = new Set<string>(["notes", "assets"]);
  if (sprintsEnabled) {
    availableTabs.add("roadmap");
    availableTabs.add("sprints");
  }
  if (hasBoard) availableTabs.add("boards");
  if (canManageTeam) availableTabs.add("team");
  if (canAccessVault) availableTabs.add("vault");

  // Falls back rather than rendering an empty page. Notes is the last resort
  // for the case the server guard is meant to prevent: neither system enabled.
  const defaultTab = sprintsEnabled ? "roadmap" : hasBoard ? "boards" : "notes";
  const activeTab = availableTabs.has(requestedTab) ? requestedTab : defaultTab;
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Lazy-loaded tab data
  const [notes, setNotes] = useState<MeetingNote[] | null>(null);
  const [sprints, setSprints] = useState<SprintDTO[] | null>(null);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [teamData, setTeamData] = useState<{ roles: ProjectRole[]; invitations: Invitation[] } | null>(null);
  const [teamMembers, setTeamMembers] = useState<Member[]>(members);
  const [vaultCredentials, setVaultCredentials] = useState<VaultCredentialDTO[] | null>(null);
  const [settingsData, setSettingsData] = useState<{ teams: Team[]; contractPrefixes: ContractPrefixOption[] } | null>(null);

  const [loadingNotes, startNotesTransition] = useTransition();
  const [loadingSprints, startSprintsTransition] = useTransition();
  const [loadingAssets, startAssetsTransition] = useTransition();
  const [loadingTeam, startTeamTransition] = useTransition();
  const [loadingVault, startVaultTransition] = useTransition();
  const [loadingSettings, startSettingsTransition] = useTransition();

  const loadTeam = useCallback(async () => {
    const [roles, invitations, nextMembers] = await Promise.all([
      getRoles(),
      getProjectInvitations(project.id),
      getProjectMembers(project.id),
    ]);
    setTeamData({ roles, invitations: invitations as unknown as Invitation[] });
    setTeamMembers(nextMembers as unknown as Member[]);
  }, [project.id]);

  const reloadTeam = useCallback(async () => {
    await loadTeam();
    router.refresh();
  }, [loadTeam, router]);
  const [noteFullscreen, setNoteFullscreen] = useState(false);
  const [noteHeader, setNoteHeader] = useState<{
    crumbs?: string[];
    title?: string;
    backLabel?: string;
  } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const noteBackRef = useRef<(() => void) | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useLayoutEffect(() => {
    useKanbanStore.getState().setTasks(tasksRef.current, project.id);
    setNotes(null);
    setSprints(null);
    setAssets(null);
    setTeamData(null);
    setTeamMembers(members);
    setVaultCredentials(null);
    setSettingsData(null);
  }, [project.id]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab !== "completed" && tab !== "board") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "roadmap");
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [searchParams]);

  const handleNoteFullscreen = useCallback((
    open: boolean,
    opts?: { goBack?: () => void; crumbs?: string[]; title?: string; backLabel?: string },
  ) => {
    setNoteFullscreen(open);
    noteBackRef.current = open && opts?.goBack ? opts.goBack : null;
    setNoteHeader(open ? { crumbs: opts?.crumbs, title: opts?.title, backLabel: opts?.backLabel } : null);
  }, []);

  const handleNotesChange = useCallback((updater: (prev: MeetingNote[]) => MeetingNote[]) => {
    setNotes((prev) => updater(prev ?? []));
  }, []);

  useEffect(() => {
    const wantsNotes =
      activeTab === "notes" || Boolean(searchParams.get("noteId"));
    if (wantsNotes && notes === null) {
      startNotesTransition(async () => {
        const data = await getMeetingNotes(project.id);
        setNotes(data as unknown as MeetingNote[]);
      });
    }
  }, [activeTab, notes, project.id, searchParams]);

  useEffect(() => {
    if (
      (activeTab === "sprints" || activeTab === "roadmap") &&
      sprints === null
    ) {
      startSprintsTransition(async () => {
        setSprints(await listSprints(project.id));
      });
    }
  }, [activeTab, sprints, project.id]);

  const handleSprintsChange: Dispatch<SetStateAction<SprintDTO[]>> = (update) => {
    setSprints((prev) => {
      const current = prev ?? [];
      return typeof update === "function" ? update(current) : update;
    });
  };

  useEffect(() => {
    function onSprintStatusChanged(event: Event) {
      const next = (event as CustomEvent<SprintDTO>).detail;
      if (!next?.id) return;
      setSprints((prev) => {
        if (!prev) return prev;
        return prev.map((sprint) => (sprint.id === next.id ? { ...sprint, ...next } : sprint));
      });
    }
    window.addEventListener("sprint-status-changed", onSprintStatusChanged);
    return () => window.removeEventListener("sprint-status-changed", onSprintStatusChanged);
  }, []);

  useEffect(() => {
    if (!notes) return;
    const noteId = searchParams.get("noteId");
    if (!noteId) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (activeTab !== "notes") setActiveTab("notes");
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
      startTeamTransition(() => loadTeam());
    }
  }, [activeTab, teamData, loadTeam]);

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

  const notesCount = notes ? notes.length : project._count.meetingNotes;
  const assetsCount = assets ? assets.length : project._count.assets;

  const projectTabs: OverflowTabItem<string>[] = [
    ...(sprintsEnabled
      ? [
          { id: "roadmap", label: "Road map" },
          { id: "sprints", label: "Active sprint" },
        ]
      : []),
    // "boards", not "board": `normalizeProjectTab` already treats `?tab=board`
    // as a legacy alias for the road map, so that id would never survive a
    // page load.
    ...(hasBoard ? [{ id: "boards", label: "Board" }] : []),
    { id: "notes", label: "Notes", count: notesCount },
    { id: "assets", label: "Assets", count: assetsCount },
  ];

  return (
    <div
      className={cn(
        (activeTab === "sprints" || activeTab === "roadmap" || activeTab === "boards") &&
          !noteFullscreen &&
          "lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden",
      )}
    >
      {isMobile && !noteFullscreen && (
        <PageOverflowItems id="project-views" order={0}>
          {projectTabs.map((tab) => {
            const label =
              tab.count != null && tab.count > 0
                ? `${tab.label} ${tab.count}`
                : tab.label;
            return (
              <DropdownMenuItem
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="flex-1">{label}</span>
                {activeTab === tab.id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </PageOverflowItems>
      )}
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
      {activeTab === "team" && canManageTeam && teamData ? (
        <PageHeaderActions>
          <InviteMemberDialog
            projectId={project.id}
            roles={teamData.roles}
            canInviteMembers={userPermissions.canInviteMembers}
            canInviteClients={userPermissions.canInviteClients}
            onChanged={reloadTeam}
          />
        </PageHeaderActions>
      ) : canCreateTask && isActive && sprintsEnabled && !noteFullscreen && activeTab !== "notes" ? (
        <PageHeaderActions>
          <AddButton
            label="New task"
            onClick={() => router.push(`/dashboard/projects/${project.id}/tasks/new`)}
          />
        </PageHeaderActions>
      ) : null}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as string)}
        className={cn(
          "w-full min-w-0 gap-0",
          // Middle link in the full-height chain: the page wrapper below sets
          // `lg:basis-0`, so any tab listed there must be listed here too or it
          // collapses to nothing at all.
          (activeTab === "sprints" || activeTab === "roadmap" || activeTab === "boards") &&
            !noteFullscreen &&
            "lg:min-h-0 lg:h-full lg:flex-1 lg:overflow-hidden",
        )}
      >
      <PageHeader hasMenu className="relative w-full min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-2">
        <div className="relative z-10 flex min-w-0 items-center gap-s">
          {noteFullscreen ? (
            <PageBackButton
              onClick={() => noteBackRef.current?.()}
              label={noteHeader?.backLabel ?? "Back"}
            />
          ) : (
            <PageBackButton href="/dashboard/projects" label="Back to all projects" />
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
          <PageBreadcrumb
            items={[
              {
                label: "Projects",
                href: "/dashboard/projects",
              },
              {
                label: project.name,
                onClick: noteFullscreen ? () => noteBackRef.current?.() : undefined,
              },
              ...(noteFullscreen
                ? (noteHeader?.crumbs ?? (noteHeader?.title ? [noteHeader.title] : [])).map((label, i, arr) => ({
                    label,
                    onClick: i < arr.length - 1 ? () => noteBackRef.current?.() : undefined,
                  }))
                : []),
            ]}
          />
          {!isActive && (
            <StatusBadge config={outlineBadge("Expired", "text-destructive", "border-destructive/30")} />
          )}
        </div>
        <div
          className={cn(
            "pointer-events-none absolute inset-0 hidden items-center justify-center lg:static lg:flex lg:pointer-events-auto",
            noteFullscreen && "invisible",
          )}
        >
          <div className="pointer-events-auto">
            <OverflowTabBar
              items={projectTabs}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>
          <TabsList className="hidden">
            {sprintsEnabled && <TabsTrigger value="roadmap" className={PROJECT_TAB_CLASS} />}
            {sprintsEnabled && <TabsTrigger value="sprints" className={PROJECT_TAB_CLASS} />}
            {hasBoard && <TabsTrigger value="boards" className={PROJECT_TAB_CLASS} />}
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
            : activeTab === "sprints" || activeTab === "boards"
              ? "flex min-h-0 flex-col overflow-hidden px-app pt-4 pb-4 lg:flex-1 lg:basis-0 lg:pb-0"
              : activeTab === "roadmap"
                ? "flex min-h-0 flex-col px-app pt-4 pb-4 lg:flex-1 lg:basis-0 lg:overflow-hidden lg:pb-0"
                : "px-app py-4",
        )}
      >
          {sprintsEnabled && (
          <TabsContent value="sprints" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab === "sprints" && (loadingSprints || !sprints ? (
              <TabSpinner />
            ) : (
              <SprintsTab
                projectId={project.id}
                sprints={sprints}
                onSprintsChange={handleSprintsChange}
                tasks={tasks as unknown as KanbanTask[]}
                userRole={userRole}
                userPermissions={userPermissions}
                isActive={isActive}
                questions={questions as unknown as (TaskQuestion & { taskType: string })[]}
                currentUserId={currentUserId}
                allowedTaskTypes={allowedTaskTypes}
                activeContractType={activeContractType}
                canManage={canEdit}
                onOpenBacklog={() => setActiveTab("roadmap")}
              />
            ))}
          </TabsContent>
          )}

          {/* Mounted only while it is the open tab, so a project that has a
              board but never opens it costs nothing to load. */}
          {hasBoard && (
            <TabsContent value="boards" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              {activeTab === "boards" && <BoardTab projectId={project.id} />}
            </TabsContent>
          )}

          {sprintsEnabled && (
          <TabsContent value="roadmap" className="flex min-h-0 w-full flex-1 flex-col overflow-visible lg:overflow-hidden">
            {activeTab === "roadmap" && (loadingSprints || !sprints ? (
              <TabSpinner />
            ) : (
              <CompletedSprintsTab
                projectId={project.id}
                sprints={sprints}
                onSprintsChange={handleSprintsChange}
                initialTasks={tasks as unknown as KanbanTask[]}
                canManage={userPermissions.isAdmin || userPermissions.canDeleteSprint}
                canMoveTasks={canEdit}
                canStartSprint={userPermissions.isAdmin || userPermissions.canStartSprint}
                canEndSprint={userPermissions.isAdmin || userPermissions.canEndSprint}
                canCreateSprintPlanning={userPermissions.isAdmin || userPermissions.canCreateSprintPlanning}
                isProjectActive={isActive}
                currentUserId={currentUserId}
              />
            ))}
          </TabsContent>
          )}

          <TabsContent value="notes">
            {activeTab === "notes" && (loadingNotes || !notes ? (
              <TabSpinner />
            ) : (
              <MeetingNotesTab
                notes={notes as unknown as MeetingNote[]}
                projectId={project.id}
                canEdit={canEdit}
                isAdmin={isAdmin}
                canCreateSprintPlanning={userPermissions.isAdmin || userPermissions.canCreateSprintPlanning}
                canStartSprint={userPermissions.isAdmin || userPermissions.canStartSprint}
                canEndSprint={userPermissions.isAdmin || userPermissions.canEndSprint}
                currentUserId={currentUserId}
                isSystemAdmin={isSystemAdmin}
                isDeadlineTestProject={isDeadlineTestProject}
                allowedTaskTypes={allowedTaskTypes ?? []}
                activeContractType={activeContractType ?? null}
                isActive={isActive}
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
            {!teamData ? (
              <TabSpinner />
            ) : (
              <div className="space-y-4">
                <h2 className="text-s font-semibold">Team Members</h2>
                <MemberList
                  members={teamMembers}
                  projectId={project.id}
                  currentUserRole={userRole}
                  currentUserId={currentUserId}
                  roles={teamData.roles}
                  invitations={teamData.invitations}
                  canManageMembers={userPermissions.canInviteMembers || userPermissions.canInviteClients}
                  canImpersonate={isSystemAdmin}
                  onTeamChanged={reloadTeam}
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
          internalMembers={members
            .filter((m) => m.user.systemRole !== "CLIENT")
            .map((m) => ({ id: m.user.id, name: m.user.name, imageUrl: m.user.imageUrl }))}
          isAdmin={isAdmin}
          boardExists={boardExists}
          boardEnabled={boardEnabled}
          sprintsEnabled={sprintsEnabled}
          onClose={() => { setSettingsOpen(false); router.refresh(); }}
        />,
        document.body
      )}
    </div>
  );
}
