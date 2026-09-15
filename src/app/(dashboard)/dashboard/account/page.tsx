import { requireUser } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import {
  userHasGoogleCalendarAccess,
  userIsOnCalendarInviteProject,
} from "@/lib/google-calendar";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const user = await requireUser();
  const [calendarConnected, showCalendarSettings] = await Promise.all([
    userHasGoogleCalendarAccess(user.id),
    userIsOnCalendarInviteProject(user.id),
  ]);

  return (
    <AccountClient
      name={user.name ?? ""}
      email={user.email}
      imageUrl={user.imageUrl ?? null}
      isClient={isClientUser(user)}
      calendarConnected={calendarConnected}
      showCalendarSettings={showCalendarSettings}
    />
  );
}
