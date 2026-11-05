import "server-only";
import { broadcast, userChannel } from "@/lib/centrifugo";

export type InboxPreviewEvent = {
  threadId: string;
  projectId: string | null;
  taskId: string | null;
  conversationId: string | null;
  kind?: "client" | "direct" | "project";
  /** Who posted. */
  authorId: string;
  lastAuthor: string;
  lastMessage: string;
  lastAt: string;
};

/**
 * Push a thread preview to each recipient's own `user:` channel, so their
 * thread list updates the instant someone posts.
 */
export async function broadcastInboxPreview(
  recipientIds: string[],
  event: InboxPreviewEvent,
): Promise<void> {
  const targets = [...new Set(recipientIds)];
  if (targets.length === 0) return;

  void broadcast(targets.map(userChannel), { type: "inbox", ...event });
}
