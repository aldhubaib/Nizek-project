export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

const GOOGLE_CALENDAR_FULL_SCOPE = "https://www.googleapis.com/auth/calendar";

export function googleAccountHasCalendarScope(
  scope: string | null | undefined,
): boolean {
  if (!scope) return false;
  return scope.split(/[\s,]+/).some((part) => {
    return (
      part === GOOGLE_CALENDAR_EVENTS_SCOPE ||
      part === GOOGLE_CALENDAR_FULL_SCOPE
    );
  });
}
