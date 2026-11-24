/**
 * Slack-shaped chat banner.
 * A room's title is the place, and the body leads with the sender.
 * A direct message's title is the person, and the body is the text.
 */
export function chatPushCopy(input: {
  authorName: string;
  /** Null for a 1:1 direct message. */
  place: string | null;
  message: string;
}): { title: string; body: string } {
  const author = input.authorName.trim() || "Someone";
  const message = input.message.trim();
  if (!input.place?.trim()) {
    return { title: author, body: message };
  }
  return {
    title: input.place.trim(),
    body: message ? `${author}: ${message}` : author,
  };
}

/** Field names the message fan-out stores on the notification. */
export function chatPushFields(input: Parameters<typeof chatPushCopy>[0]): {
  title: string;
  notifBody: string;
} {
  const copy = chatPushCopy(input);
  return { title: copy.title, notifBody: copy.body };
}
