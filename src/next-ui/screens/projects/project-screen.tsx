"use client";

import { FolderKanban, IterationCcw } from "lucide-react";

import { HeaderCardSkeleton, RecordRowSkeleton } from "@/next-ui/blocks";
import { useProject, type ProjectDetail } from "@/next-ui/data/projects";
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
import { NotesView } from "./notes-view";
import { RoadmapView } from "./roadmap-view";
import { SettingsView } from "./settings-view";
import { TeamView } from "./team-view";
import { VaultView } from "./vault-view";

/**
 * One project, turned to one of its pages: About (its header card and contracts) when no
 * view is named, else the view the sidebar's project menu chose — Road map, Active sprint,
 * Assets, Notes, Team, Vault, Settings. The pane's breadcrumb names the page; the body is the
 * page alone. Everything reads live data; moving tasks, starting sprints, writing notes,
 * inviting people and changing settings are not built here yet.
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
      return sprints ? <RoadmapView projectId={p.id} /> : <SprintsOff />;
    case "sprint":
      return sprints ? <ActiveSprintView projectId={p.id} onOpenRoadmap={onOpenRoadmap} /> : <SprintsOff />;
    case "notes":
      return sprints ? <NotesView projectId={p.id} /> : <SprintsOff />;
    case "assets":
      return <AssetsView projectId={p.id} canUpload={rights.canUpload} canDelete={rights.canDeleteAssets} />;
    case "team":
      return <TeamView project={p} now={now} />;
    case "vault":
      return <VaultView projectId={p.id} />;
    case "settings":
      return <SettingsView project={p} />;
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
}

/** What the viewer may do here, from their membership: the server checks the same rules again. */
export function viewerRights(
  p: Pick<ProjectDetail, "members">,
  viewerId: string | undefined,
  systemRole: string | undefined,
): ViewerRights {
  const member = viewerId ? p.members.find((m) => m.user.id === viewerId) : undefined;
  const admin = systemRole === "ADMIN";
  const role = member?.role;
  return {
    canUpload: Boolean(viewerId) && role !== "CLIENT",
    canDeleteAssets: admin || role === "ADMIN" || role === "PROJECT_MANAGER",
  };
}
