import { getProjects } from "@/actions/project";
import { getTeams } from "@/actions/team";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { ProjectCard } from "@/components/project/project-card";
import { FolderKanban, Archive } from "lucide-react";

export default async function ProjectsPage() {
  const [projects, teams] = await Promise.all([getProjects(), getTeams()]);

  const now = new Date();
  const isProjectActive = (p: (typeof projects)[number]) =>
    p.contracts.some((c) => {
      if (c.latePayment) return false;
      if (c.contractType === "STARTUP") return true;
      if (!c.startDate || !c.endDate) return false;
      return new Date(c.startDate) <= now && new Date(c.endDate) >= now;
    });
  const activeProjects = projects.filter(isProjectActive);
  const archivedProjects = projects.filter((p) => !isProjectActive(p));

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Projects</h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
          <CreateProjectDialog teams={teams} />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 min-h-[calc(100vh-120px)]">
          <FolderKanban className="w-10 h-10 text-muted-foreground opacity-50" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">
            No projects yet. Create your first project.
          </p>
          <CreateProjectDialog teams={teams} />
        </div>
      ) : (
        <div className="px-6 py-6">
          {activeProjects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeProjects.map((project) => (
                <ProjectCard key={project.id} project={project} teams={teams} />
              ))}
            </div>
          )}

          {activeProjects.length === 0 && archivedProjects.length > 0 && (
            <p className="text-[12px] text-muted-foreground/60 mb-6">
              No active projects. All projects are archived.
            </p>
          )}

          {archivedProjects.length > 0 && (
            <div className={activeProjects.length > 0 ? "mt-10" : ""}>
              <div className="flex items-center gap-2 mb-4">
                <Archive className="w-4 h-4 text-muted-foreground/50" strokeWidth={1.5} />
                <h2 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Archive
                </h2>
                <span className="text-[10px] text-muted-foreground/50 font-mono">
                  {archivedProjects.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-60">
                {archivedProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} teams={teams} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
