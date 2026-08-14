/** Turn typed `@Name` runs into chat mention tokens `@[Name](id)`. */
export function toMentionTokens(
  text: string,
  members: { id: string; name: string | null }[],
): { body: string; mentionedIds: string[] } {
  const named = members
    .filter((m): m is { id: string; name: string } => Boolean(m.name))
    .sort((a, b) => b.name.length - a.name.length);

  const mentionedIds: string[] = [];
  let body = text;
  for (const m of named) {
    const re = new RegExp(`@${escapeRegExp(m.name)}\\b`, "g");
    if (re.test(body)) {
      mentionedIds.push(m.id);
      body = body.replace(re, `@[${m.name}](${m.id})`);
    }
  }
  return { body, mentionedIds: [...new Set(mentionedIds)] };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
