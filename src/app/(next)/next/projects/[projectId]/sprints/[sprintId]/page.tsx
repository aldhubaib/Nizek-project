import { childId } from "@/next-ui/panes/pane-kinds";
import { SprintScreen } from "@/next-ui/screens/projects/sprint-screen";

/** One sprint's document in the main pane (`/next/projects/<id>/sprints/<id>`); the pane id is the two ids joined. */
export default async function NextSprintPage({ params }: { params: Promise<{ projectId: string; sprintId: string }> }) {
  const { projectId, sprintId } = await params;
  return <SprintScreen id={childId(projectId, sprintId)} />;
}
