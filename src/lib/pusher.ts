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

export type TaskEvent =
  | { type: "task-moved"; taskId: string; stage: string; order: number; userId: string }
  | { type: "task-created"; taskId: string; userId: string }
  | { type: "task-updated"; taskId: string; userId: string }
  | { type: "task-deleted"; taskId: string; userId: string }
  | { type: "task-declined"; taskId: string; userId: string };

export async function broadcastTaskEvent(projectId: string, event: TaskEvent) {
  const pusher = getPusher();
  if (!pusher) return;

  try {
    await pusher.trigger(projectChannel(projectId), "task-change", event);
  } catch (err) {
    console.error("Pusher broadcast error:", err);
  }
}
