/**
 * Errors that mean "this project can't be shown to this user" — either it does
 * not exist (e.g. deleted) or the user isn't a member. These are normal
 * navigation outcomes (stale links, shared URLs), not server faults, so callers
 * should render a 404 rather than surfacing the error boundary.
 */
const PROJECT_ACCESS_MESSAGES = new Set([
  "Project not found",
  "Not a member of this project",
]);

export function isProjectAccessError(err: unknown): boolean {
  return err instanceof Error && PROJECT_ACCESS_MESSAGES.has(err.message);
}

/**
 * Boolean "can this user read this project?" check for realtime authorization
 * and chat access. Wraps requireProjectMember (which throws for
 * non-members/missing projects) so callers get a simple yes/no. System admins
 * pass via the virtual-member path in requireProjectMember.
 */
export async function hasProjectAccess(projectId: string): Promise<boolean> {
  const { requireProjectMember } = await import("@/lib/auth");
  try {
    await requireProjectMember(projectId);
    return true;
  } catch {
    return false;
  }
}
