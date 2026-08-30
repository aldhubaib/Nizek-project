import "server-only";
import { broadcast, userChannel } from "@/lib/centrifugo";
import { getAliasMap, maskBody, maskName, NO_MASK } from "@/lib/alias";
import { clientViewerIds } from "@/lib/client-role";

export type InboxPreviewEvent = {
  threadId: string;
  projectId: string | null;
  taskId: string | null;
  conversationId: string | null;
  kind?: "client" | "direct" | "project";
  /** Who posted, so their name can be swapped for their alias per recipient. */
  authorId: string;
  lastAuthor: string;
  lastMessage: string;
  lastAt: string;
};

/**
 * Push a thread preview to each recipient's own channel, rendering a separate
 * copy for clients.
 *
 * The preview carries a name and a slice of the message, which makes one shared
 * payload impossible: a client's thread list would show the real name the
 * instant someone posted, even though reloading the page shows the alias. Every
 * recipient reads their own `user:` channel, so the split is just two publishes.
 */
export async function broadcastInboxPreview(
  recipientIds: string[],
  event: InboxPreviewEvent,
): Promise<void> {
  const targets = [...new Set(recipientIds)];
  if (targets.length === 0) return;

  const payload = { type: "inbox", ...event };
  const { projectId } = event;
  const aliasMap = projectId ? await getAliasMap(projectId) : NO_MASK;
  if (!projectId || aliasMap.size === 0) {
    void broadcast(targets.map(userChannel), payload);
    return;
  }

  const clientIds = await clientViewerIds(targets, projectId);

  const staff = targets.filter((id) => !clientIds.has(id));
  if (staff.length > 0) void broadcast(staff.map(userChannel), payload);
  if (clientIds.size === 0) return;

  void broadcast([...clientIds].map(userChannel), {
    ...payload,
    lastAuthor: maskName(event.authorId, event.lastAuthor, aliasMap),
    lastMessage: maskBody(event.lastMessage, aliasMap),
  });
}
