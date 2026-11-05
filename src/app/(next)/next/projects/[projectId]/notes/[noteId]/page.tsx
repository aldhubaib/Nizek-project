import { childId } from "@/next-ui/panes/pane-kinds";
import { NoteScreen } from "@/next-ui/screens/projects/note-screen";

/** One note in the main pane (`/next/projects/<id>/notes/<id>`); the pane id is the two ids joined. */
export default async function NextNotePage({ params }: { params: Promise<{ projectId: string; noteId: string }> }) {
  const { projectId, noteId } = await params;
  return <NoteScreen id={childId(projectId, noteId)} />;
}
