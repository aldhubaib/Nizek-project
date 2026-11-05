import { notFound } from "next/navigation";

import { isView } from "@/next-ui/panes/pane-kinds";
import { ProjectScreen } from "@/next-ui/screens/projects/project-screen";

/**
 * One of a project's pages in the main pane (`/next/projects/<id>/roadmap`, `/sprint`,
 * `/assets`, `/notes`, `/team`, `/vault`, `/settings`); the same screen the pane router
 * renders beside something else. A name that is not a view is not a page.
 */
export default async function NextProjectViewPage({ params }: { params: Promise<{ projectId: string; view: string }> }) {
  const { projectId, view } = await params;
  if (!isView("project", view)) notFound();
  return <ProjectScreen id={projectId} view={view} />;
}
