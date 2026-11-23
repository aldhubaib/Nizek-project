import { conversationChannel, projectChannel } from "./channels";

export interface DeliveryCursorDb {
  chatReadCursor: {
    updateMany(args: {
      where: {
        userId: string;
        threadId: string;
        OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: Date } }];
      };
      data: { lastDeliveredAt: Date };
    }): Promise<{ count: number }>;
  };
}

export type PublishFn = (channels: string[], data: Record<string, unknown>) => Promise<unknown>;

/** Map an inbox thread id (`conv-<id>` | `project-<id>`) to its Centrifugo channel. */
export function channelForInboxThreadId(threadId: string): string | null {
  if (threadId.startsWith("conv-")) return conversationChannel(threadId.slice(5));
  if (threadId.startsWith("project-")) return projectChannel(threadId.slice(8));
  return null;
}

/**
 * Monotonically advance `ChatReadCursor.lastDeliveredAt` for each recipient on
 * an inbox thread and broadcast `thread.delivered` for everyone whose cursor
 * actually moved forward.
 *
 * Uses `updateMany` (not `upsert`) so a missing cursor row is never fabricated
 * with a synthetic `lastReadAt` (send fan-out already seeds the row before
 * pushes or realtime events fire).
 */
export async function recordThreadDelivered(
  db: DeliveryCursorDb,
  publish: PublishFn,
  input: { threadId: string; userIds: string[]; at?: Date },
): Promise<string[]> {
  const channel = channelForInboxThreadId(input.threadId);
  const uniqueIds = [...new Set(input.userIds)].filter(Boolean);
  if (!channel || uniqueIds.length === 0) return [];

  const at = input.at ?? new Date();
  const iso = at.toISOString();
  const advanced: string[] = [];

  await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const res = await db.chatReadCursor.updateMany({
          where: {
            userId,
            threadId: input.threadId,
            OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: at } }],
          },
          data: { lastDeliveredAt: at },
        });
        if (res.count > 0) {
          advanced.push(userId);
          void publish([channel], {
            type: "thread.delivered",
            memberId: userId,
            lastDeliveredAt: iso,
          });
        }
      } catch {
        // Best-effort delivery receipts never block inbox or push work.
      }
    }),
  );

  return advanced;
}
