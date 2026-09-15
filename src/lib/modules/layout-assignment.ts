/**
 * A layout belongs to at most one task flow. Sharing one form across
 * pipelines mixes fields and required checks.
 */

export function exclusiveLayoutChoices<T extends { id: string }>(
  layouts: T[],
  flows: { id: string; layoutId: string | null }[],
  flowId: string,
): T[] {
  const current = flows.find((flow) => flow.id === flowId)?.layoutId ?? null;
  const taken = new Set(
    flows
      .filter((flow) => flow.id !== flowId && flow.layoutId)
      .map((flow) => flow.layoutId as string),
  );
  return layouts.filter(
    (layout) => layout.id === current || !taken.has(layout.id),
  );
}
