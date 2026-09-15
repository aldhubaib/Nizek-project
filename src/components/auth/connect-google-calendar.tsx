"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Calendar, Loader2, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { GOOGLE_CALENDAR_EVENTS_SCOPE } from "@/lib/google-calendar-scope";
import { cn } from "@/lib/utils";

export function ConnectGoogleCalendarButton({
  callbackURL,
  className,
}: {
  callbackURL?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      className={className}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await authClient.linkSocial({
            provider: "google",
            callbackURL: callbackURL || pathname || "/dashboard",
            errorCallbackURL: "/sign-in",
            scopes: [GOOGLE_CALENDAR_EVENTS_SCOPE],
            additionalParams: {
              access_type: "offline",
              prompt: "consent",
              include_granted_scopes: "true",
            },
          });
        } catch {
          setLoading(false);
        }
      }}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Calendar className="h-4 w-4" />
      )}
      {loading ? "Connecting…" : "Connect Google Calendar"}
    </Button>
  );
}

export function ConnectGoogleCalendarBanner() {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-[9000] flex w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-xl backdrop-blur-md max-lg:bottom-20",
      )}
    >
      <Calendar className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-s text-foreground">
        This project sends Calendar invites. Connect only if you will send
        them — other people on Nizek do not need this.
      </p>
      <ConnectGoogleCalendarButton className="shrink-0" />
      <button
        type="button"
        aria-label="Dismiss"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => setHidden(true)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
