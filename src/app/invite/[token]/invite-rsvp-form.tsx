"use client";

import { useState } from "react";
import { respondToInvite, type InviteRsvpView } from "@/actions/calendar-invite";
import { Button } from "@/components/ui/button";
import type { InviteRsvp } from "@/lib/fields/invite";

export function InviteRsvpForm({
  token,
  initial,
}: {
  token: string;
  initial: InviteRsvpView;
}) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reply(status: InviteRsvp) {
    setPending(true);
    setError(null);
    const result = await respondToInvite(token, status);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setView(result.data);
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {view.title}
      </p>
      <h1 className="text-l font-semibold">{view.recordTitle}</h1>
      {view.when && <p className="text-s text-muted-foreground">{view.when}</p>}
      {(view.location || view.mapsUrl) &&
        (view.mapsUrl ? (
          <a
            href={view.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-s text-primary hover:underline"
          >
            {view.location || "Open in Google Maps"}
          </a>
        ) : (
          <p className="text-s text-muted-foreground">{view.location}</p>
        ))}
      {view.already && (
        <p className="text-s">
          Your reply:{" "}
          <span className="font-medium">
            {view.status === "accepted"
              ? "Yes"
              : view.status === "declined"
                ? "No"
                : view.status === "tentative"
                  ? "Maybe"
                  : "Waiting"}
          </span>
        </p>
      )}
      {error && <p className="text-s text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => reply("accepted")}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => reply("tentative")}
        >
          Maybe
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => reply("declined")}
        >
          No
        </Button>
      </div>
    </div>
  );
}
