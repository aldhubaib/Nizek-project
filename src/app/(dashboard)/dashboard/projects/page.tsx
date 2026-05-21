import { getProjects } from "@/actions/project";
import { ProjectList } from "@/components/project/project-list";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { FolderKanban } from "lucide-react";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Projects</h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
          <CreateProjectDialog />
        </div>
      </div>

      <div className="px-6 py-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 min-h-[calc(100vh-120px)]">
            <FolderKanban className="w-10 h-10 text-muted-foreground opacity-50" strokeWidth={1.5} />
            <p className="text-[13px] text-muted-foreground">
              No projects yet. Create your first project.
            </p>
            <CreateProjectDialog />
          </div>
        ) : (
          <ProjectList projects={projects} />
        )}
      </div>
    </div>
  );
}
