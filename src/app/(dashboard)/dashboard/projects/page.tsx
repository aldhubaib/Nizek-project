import { getProjects } from "@/actions/project";
import { getTeams } from "@/actions/team";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { redirect } from "next/navigation";
import { ProjectsPageClient } from "./projects-page-client";

export default async function ProjectsPage() {
  const user = await requireUser();
  if (isClientUser(user)) redirect("/dashboard/messages");

  const [projectsResult, teams, contractPrefixes] = await Promise.all([
    getProjects(),
    getTeams(),
    getContractPrefixes(),
  ]);

  const nonDefaultTeams = teams.filter((t: any) => !t.isDefault);

  return (
    <ProjectsPageClient
      projects={JSON.parse(JSON.stringify(projectsResult.items))}
      teams={JSON.parse(JSON.stringify(nonDefaultTeams))}
      contractPrefixes={JSON.parse(JSON.stringify(contractPrefixes))}
    />
  );
}
