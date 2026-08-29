export function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1),
  };
}

export function joinDisplayName(first?: string | null, last?: string | null): string {
  return [first, last].filter((part) => part?.trim()).join(" ").trim();
}
