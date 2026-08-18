/** Days until due: positive = before due, 0 = due today, negative = overdue. */

/** Reminders before the due date. */
export const BEFORE_DUE_MILESTONES = [30, 20, 10, 0] as const;

export type BeforeDueMilestone = (typeof BEFORE_DUE_MILESTONES)[number];

/** After due date, remind every this many days overdue until completed. */
export const OVERDUE_REMINDER_INTERVAL_DAYS = 3;

/** Admin test menu: before-due milestones + sample overdue cadence. */
export const DEADLINE_REMINDER_TEST_SCENARIOS = [
  30,
  20,
  10,
  0,
  -3,
  -6,
  -9,
  -12,
] as const;

/** @deprecated Use BEFORE_DUE_MILESTONES + isDeadlineReminderDay for overdue cadence. */
export const DEADLINE_MILESTONES = DEADLINE_REMINDER_TEST_SCENARIOS;

export type DeadlineMilestone = (typeof DEADLINE_REMINDER_TEST_SCENARIOS)[number];

export function isDeadlineReminderDay(daysUntil: number): boolean {
  if ((BEFORE_DUE_MILESTONES as readonly number[]).includes(daysUntil)) {
    return true;
  }
  return (
    daysUntil < 0 &&
    daysUntil % OVERDUE_REMINDER_INTERVAL_DAYS === 0
  );
}

export function milestoneLabel(offsetDays: number): string {
  if (offsetDays > 0) return `${offsetDays} days before due`;
  if (offsetDays === 0) return "Due today";
  return `${Math.abs(offsetDays)} days overdue`;
}
