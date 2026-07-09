"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

// Primarily event-driven: we check on tab focus / visibility changes (which
// covers the common "user came back to the app" case). A long backstop interval
// catches deploys while the tab stays focused, without a chatty 60s poll.
const POLL_INTERVAL_MS = 10 * 60_000;

interface VersionResponse {
  version: string;
  logo: string;
}

function setFavicon(href: string) {
  if (typeof document === "undefined") return;
  const links = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  links.forEach((link) => {
    link.href = href;
  });
}

/**
 * Watches for new deployments and prompts the user to update.
 *
 * `currentVersion` is the build identifier baked into the page the user loaded.
 * We poll `/api/version` (served by whatever container is currently live); when it
 * reports a different version, a newer build has shipped. We surface a popup so the
 * user can reload into it, and we also swap the favicon so a changed app logo shows
 * up immediately — even before they choose to update.
 */
export function UpdateNotifier({ currentVersion }: { currentVersion: string }) {
  const [newVersion, setNewVersion] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as VersionResponse;
      if (!data?.version || data.version === currentVersion) return;

      // A changed logo should apply right away.
      if (data.logo) setFavicon(data.logo);

      setNewVersion(data.version);
    } catch {
      // Network hiccup — ignore and retry on the next interval.
    }
  }, [currentVersion]);

  useEffect(() => {
    // Skip polling in local/dev where there is no real deploy version to compare.
    if (currentVersion === "dev" || currentVersion.startsWith("dev.")) return;

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [check, currentVersion]);

  if (!newVersion) return null;

  const update = () => {
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 left-4 z-[1000] w-[calc(100%-2rem)] max-w-[320px] animate-in fade-in slide-in-from-bottom-2">
      <div className="rounded-xl border border-border bg-card shadow-lg shadow-black/40 p-3.5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              A new version is available
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
              Update now to get the latest features and fixes.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={update}
                className="h-7 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/80 transition-colors"
              >
                Update now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
