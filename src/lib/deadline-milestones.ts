/** Days until due: positive = before due, 0 = due today, negative = overdue. */
export const DEADLINE_MILESTONES = [30, 20, 10, 0, -10, -20, -30] as const;

export type DeadlineMilestone = (typeof DEADLINE_MILESTONES)[number];

export function milestoneLabel(offsetDays: DeadlineMilestone): string {
  if (offsetDays > 0) return `${offsetDays} days before due`;
  if (offsetDays === 0) return "Due today";
  return `${Math.abs(offsetDays)} days overdue`;
}
