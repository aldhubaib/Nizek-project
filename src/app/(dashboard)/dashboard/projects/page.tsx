import { getProjects } from "@/actions/project";
import { getTeams } from "@/actions/team";
import { getContractPrefixes } from "@/actions/contract-prefix";
import { ProjectsPageClient } from "./projects-page-client";

export default async function ProjectsPage() {
  const [projects, teams, contractPrefixes] = await Promise.all([
    getProjects(),
    getTeams(),
    getContractPrefixes(),
  ]);

  const nonDefaultTeams = teams.filter((t: any) => !t.isDefault);

  return (
    <ProjectsPageClient
      projects={JSON.parse(JSON.stringify(projects))}
      teams={JSON.parse(JSON.stringify(nonDefaultTeams))}
      contractPrefixes={JSON.parse(JSON.stringify(contractPrefixes))}
    />
  );
}
