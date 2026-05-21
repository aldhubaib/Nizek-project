import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getProjects } from "@/actions/project";
import { FolderKanban } from "lucide-react";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";

export default async function DashboardPage() {
  const user = await requireUser();
  const projects = await getProjects();

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
          <CreateProjectDialog />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 min-h-[calc(100vh-48px)]">
          <FolderKanban className="w-10 h-10 text-muted-foreground opacity-50" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">
            No projects yet.
          </p>
          <CreateProjectDialog />
        </div>
      ) : (
        <div className="px-6 py-6">
          <p className="text-[13px] text-muted-foreground mb-6">
            Welcome back, {user.name || "there"}. Select a project to get started.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => {
              const now = new Date();
              const isActive = project.contracts.some(
                (c) => new Date(c.startDate) <= now && new Date(c.endDate) >= now
              );
              return (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="rounded-lg bg-card border border-border p-4 hover:border-muted-foreground/20 transition-colors no-underline"
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-semibold text-primary">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">
                        {project.name}
                      </p>
                    </div>
                    {!isActive && (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold bg-destructive/15 text-destructive border-destructive/20">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{project._count.members} members</span>
                    <span>{project._count.tasks} tasks</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
