import { loadInviteRsvp } from "@/actions/calendar-invite";
import { InviteRsvpForm } from "./invite-rsvp-form";

export default async function InviteRsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const view = await loadInviteRsvp(decoded);

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      {view ? (
        <InviteRsvpForm token={decoded} initial={view} />
      ) : (
        <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-6 text-s text-muted-foreground">
          This invite link is not valid, or you were removed from the meeting.
        </div>
      )}
    </main>
  );
}
