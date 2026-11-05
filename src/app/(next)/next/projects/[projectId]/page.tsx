import { ProjectScreen } from "@/next-ui/screens/projects/project-screen";

/** One project in the main pane (`/next/projects/<id>`); the same screen the pane router renders beside a list. */
export default async function NextProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectScreen id={projectId} />;
}
