import Pusher from "pusher";

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher | null {
  if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_KEY || !process.env.PUSHER_SECRET || !process.env.PUSHER_CLUSTER) {
    return null;
  }

  if (!pusherInstance) {
    pusherInstance = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true,
    });
  }

  return pusherInstance;
}

export function projectChannel(projectId: string) {
  return `project-${projectId}`;
}

export function userChannel(userId: string) {
  return `user-${userId}`;
}

export type TaskEvent =
  | { type: "task-moved"; taskId: string; stage: string; order: number; userId: string }
  | { type: "task-created"; taskId: string; userId: string }
  | { type: "task-updated"; taskId: string; userId: string }
  | { type: "task-deleted"; taskId: string; userId: string }
  | { type: "task-declined"; taskId: string; userId: string };

export type MentionEvent = {
  type: "mention-created";
  fromUserId: string;
};

export async function broadcastTaskEvent(projectId: string, event: TaskEvent) {
  const pusher = getPusher();
  if (!pusher) return;

  try {
    await pusher.trigger(projectChannel(projectId), "task-change", event);
  } catch (err) {
    console.error("Pusher broadcast error:", err);
  }
}

export async function broadcastMentionEvent(targetUserIds: string[], fromUserId: string) {
  const pusher = getPusher();
  if (!pusher || targetUserIds.length === 0) return;

  const event: MentionEvent = { type: "mention-created", fromUserId };
  const channels = targetUserIds.map((id) => userChannel(id));

  try {
    const batches = [];
    for (let i = 0; i < channels.length; i += 10) {
      batches.push(pusher.trigger(channels.slice(i, i + 10), "mention", event));
    }
    await Promise.all(batches);
  } catch (err) {
    console.error("Pusher mention broadcast error:", err);
  }
}
