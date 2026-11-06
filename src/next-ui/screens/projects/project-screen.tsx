"use client";

import { FolderKanban, IterationCcw } from "lucide-react";

import { getActiveContract } from "@/lib/contract-rules";
import { canSprint, getAdminPermissions, getPermissionsFromRole, type ProjectRolePermissions } from "@/lib/permissions";
import { HeaderCardSkeleton, RecordRowSkeleton } from "@/next-ui/blocks";
import { kanbanOn, proofVideoModeOf, useProject, type ProjectDetail } from "@/next-ui/data/projects";
import { useNow } from "@/next-ui/hooks/use-now";
import { useViewer } from "@/next-ui/lib/viewer";
import { hrefFromEntry, usePane, type PaneEntry } from "@/next-ui/panes";
import { viewTitle } from "@/next-ui/panes/pane-registry";
import { EmptyState } from "@/next-ui/patterns/empty-state";
import { PageHeader } from "@/next-ui/patterns/page-header";
import { Button } from "@/next-ui/ui/button";

import { AboutView } from "./about-view";
import { ActiveSprintView } from "./active-sprint-view";
import { AssetsView } from "./assets-view";
import { KanbanView } from "./kanban-view";
import { NotesView } from "./notes-view";
import { RoadmapView } from "./roadmap-view";
import { SettingsView } from "./settings-view";
import { TeamView } from "./team-view";
import { VaultView } from "./vault-view";

/**
 * One project, turned to one of its pages: About (its header card and contracts) when no
 * view is named, else the view the sidebar's project menu chose — Road map, Active sprint,
 * Kanban, Assets, Notes, Team, Vault, Settings. The pane's breadcrumb names the page; the body
 * is the page alone. Everything reads live data, and everything the live panel lets a member
 * change can be changed here by the same rules: `viewerRights` works them out once from the
 * membership and the contract, each page shows only the controls its viewer has, and the
 * server checks every call again.
 */
export function ProjectScreen({ id, view }: { id: string; view?: string }) {
  const project = useProject(id);
  const pane = usePane();
  const now = useNow();
  const viewer = useViewer();
  const entry: PaneEntry = { kind: "project", id, view };
  const page = viewTitle(entry);

  if (project.isPending) {
    return (
      <>
        <PageHeader title={page ?? "Project"} />
        <div className="flex flex-col gap-4" aria-busy>
          {page ? (
            <>
              <RecordRowSkeleton />
              <RecordRowSkeleton />
              <RecordRowSkeleton />
            </>
          ) : (
            <HeaderCardSkeleton />
          )}
        </div>
      </>
    );
  }
  if (project.error || !project.data) {
    return (
      <>
        <PageHeader title={page ?? "Project"} />
        <EmptyState
          icon={FolderKanban}
          title="Could not open this project"
          description={project.error ? String(project.error instanceof Error ? project.error.message : project.error) : "It may have been deleted."}
          action={
            <Button variant="outline" onClick={pane.back}>
              Back
            </Button>
          }
        />
      </>
    );
  }

  const p = project.data;
  const sprints = p.sprintsEnabled !== false;
  const rights = viewerRights(p, viewer?.id, viewer?.systemRole);
  const title = page ? `${p.name} · ${page}` : p.name;

  return (
    <>
      <PageHeader title={title} />
      <ProjectPage
        project={p}
        view={view}
        now={now}
        sprints={sprints}
        rights={rights}
        onOpenRoadmap={() => pane.navigate(hrefFromEntry({ kind: "project", id, view: "roadmap" }))}
      />
    </>
  );
}

function ProjectPage({
  project: p,
  view,
  now,
  sprints,
  rights,
  onOpenRoadmap,
}: {
  project: ProjectDetail;
  view: string | undefined;
  now: Date;
  sprints: boolean;
  rights: ViewerRights;
  onOpenRoadmap: () => void;
}) {
  switch (view) {
    case undefined:
      return <AboutView project={p} now={now} />;
    case "roadmap":
      return sprints ? <RoadmapView project={p} rights={rights} /> : <SprintsOff />;
    case "sprint":
      return sprints ? <ActiveSprintView project={p} rights={rights} onOpenRoadmap={onOpenRoadmap} /> : <SprintsOff />;
    case "notes":
      return sprints ? <NotesView projectId={p.id} rights={rights} /> : <SprintsOff />;
    case "kanban":
      return <KanbanView projectId={p.id} on={kanbanOn(p)} canEditSettings={rights.canEditSettings} />;
    case "assets":
      return <AssetsView projectId={p.id} canUpload={rights.canUpload} canDelete={rights.canDeleteAssets} />;
    case "team":
      return <TeamView project={p} now={now} rights={rights} />;
    case "vault":
      return <VaultView projectId={p.id} />;
    case "settings":
      return <SettingsView project={p} canEdit={rights.canEditSettings} canEditRoles={rights.canEditRoles} />;
    default:
      return <EmptyState icon={FolderKanban} title="No such page" description="This project has no page by that name." />;
  }
}

/** Road map, Active sprint and Notes belong to the sprint system; a project tracked another way has none. */
function SprintsOff() {
  return (
    <EmptyState
      icon={IterationCcw}
      title="Sprints are off for this project"
      description="This project is tracked without sprints, so it has no road map, active sprint or notes. Sprints can be turned on in its settings."
    />
  );
}

export interface ViewerRights {
  canUpload: boolean;
  canDeleteAssets: boolean;
  /** Add team members by account or by email, change their roles, remove them. */
  canInviteMembers: boolean;
  /** The same for clients (people on a client role). */
  canInviteClients: boolean;
  /** Either of the two: the Team page shows its controls. */
  canManageTeam: boolean;
  /** Name, description, logo, team, sprints and client chat on the Settings page. */
  canEditSettings: boolean;
  /** The project's own roles: system admins, project admins (a role marked Admin) and the ADMIN seat. */
  canEditRoles: boolean;
  /** The viewer's own id, or none outside the shell. */
  viewerId: string | null;
  /** Nizek's system admin: every right on every project. */
  isSystemAdmin: boolean;
  /** A client account: reads the road map, writes nothing. */
  isClient: boolean;
  /** The project's task rights, the live panel's shape; `canTransition` and `canModifyInStage` read it. */
  perms: ProjectRolePermissions;
  /**
   * The project has a paid-up contract today. Without one, tasks and sprints are frozen for
   * everyone but a system admin (the server's rule on every task write).
   */
  projectActive: boolean;
  /** Tasks may be changed at all: the contract allows it and the viewer is staff. */
  canWorkTasks: boolean;
  canCreateTasks: boolean;
  /** Drag a task between stages or in and out of sprints (the role's transitions decide which). */
  canMoveTasks: boolean;
  canDeclineTasks: boolean;
  canDeleteTasks: boolean;
  /** Schedule tasks into sprints, set estimates, assignees, Decision and Risk (`requireSprintEditor`). */
  canPlanTasks: boolean;
  canCreateSprints: boolean;
  canStartSprints: boolean;
  canEndSprints: boolean;
  canDeleteSprints: boolean;
  /** Write and edit notes: any member who is not a client. */
  canWriteNotes: boolean;
  /** The project's video rule, read by the moves into Internal review. */
  proofVideoMode: ReturnType<typeof proofVideoModeOf>;
}

/**
 * What the viewer may do here, from their membership: the server checks the same rules again.
 * A system admin may do everything on every project, member of it or not. A project admin
 * (a role marked Admin) manages the whole team; another member manages what their seat
 * allows, members or clients. Settings are for admins and project managers. Task and sprint
 * rights come from the member's project role, as on the live panel's boards, and all of them
 * wait for an active contract.
 */
export function viewerRights(
  p: Pick<ProjectDetail, "members"> & Partial<Pick<ProjectDetail, "contracts" | "proofVideoMode">>,
  viewerId: string | undefined,
  systemRole: string | undefined,
): ViewerRights {
  const member = viewerId ? p.members.find((m) => m.user.id === viewerId) : undefined;
  const admin = systemRole === "ADMIN";
  const role = member?.role;
  const isClient = role === "CLIENT" || Boolean(member?.projectRole?.isClient);
  const projectAdmin = admin || Boolean(member?.projectRole?.isAdmin);
  const canInviteMembers = projectAdmin || Boolean(member?.canInviteMembers);
  const canInviteClients = projectAdmin || Boolean(member?.canInviteClients);
  const perms = admin ? getAdminPermissions() : getPermissionsFromRole(member?.projectRole ?? null);
  const projectActive = Boolean(getActiveContract((p.contracts ?? []) as Parameters<typeof getActiveContract>[0]));
  const staff = Boolean(viewerId) && (admin || Boolean(member)) && !isClient;
  const canWorkTasks = staff && (admin || projectActive);
  return {
    canUpload: Boolean(viewerId) && role !== "CLIENT",
    canDeleteAssets: admin || role === "ADMIN" || role === "PROJECT_MANAGER",
    canInviteMembers,
    canInviteClients,
    canManageTeam: canInviteMembers || canInviteClients,
    canEditSettings: admin || role === "ADMIN" || role === "PROJECT_MANAGER",
    canEditRoles: projectAdmin || role === "ADMIN",
    viewerId: viewerId ?? null,
    isSystemAdmin: admin,
    isClient,
    perms,
    projectActive,
    canWorkTasks,
    canCreateTasks: canWorkTasks && (perms.isAdmin || perms.canCreateTask),
    canMoveTasks: canWorkTasks && (perms.isAdmin || perms.canMoveTask),
    canDeclineTasks: canWorkTasks && (perms.isAdmin || perms.canDeclineTask),
    canDeleteTasks: canWorkTasks && (perms.isAdmin || perms.canDeleteTask),
    canPlanTasks: canWorkTasks && (perms.isAdmin || perms.canModifyTask),
    canCreateSprints: canWorkTasks && canSprint(perms, "createPlanning"),
    canStartSprints: canWorkTasks && canSprint(perms, "start"),
    canEndSprints: canWorkTasks && canSprint(perms, "end"),
    canDeleteSprints: canWorkTasks && canSprint(perms, "delete"),
    canWriteNotes: staff,
    proofVideoMode: proofVideoModeOf(p),
  };
}
