import { childId } from "@/next-ui/panes/pane-kinds";
import { TaskScreen } from "@/next-ui/screens/projects/task-screen";

/** One task in the main pane (`/next/projects/<id>/tasks/<id>`); the pane id is the two ids joined. */
export default async function NextTaskPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  return <TaskScreen id={childId(projectId, taskId)} />;
}
