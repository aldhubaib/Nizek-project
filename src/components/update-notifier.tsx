"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  APP_UPDATE_STORAGE_KEY,
  NOTIF_SOUND_CACHE,
  applyPoll,
  decideMountAction,
  parseRelease,
  parseStoredUpdate,
  pickLatest,
  shouldSkipUpdateCheck,
  stripCacheBust,
  withCacheBust,
  type AppRelease,
  type StoredUpdate,
} from "@/lib/app-release";
import { useBranding } from "@/components/branding-provider";

function readStored(): StoredUpdate | null {
  try {
    return parseStoredUpdate(sessionStorage.getItem(APP_UPDATE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function persist(target: StoredUpdate) {
  try {
    sessionStorage.setItem(APP_UPDATE_STORAGE_KEY, JSON.stringify(target));
  } catch {
    // Private mode / quota — in-memory state still drives this page.
  }
}

function clearStored() {
  try {
    sessionStorage.removeItem(APP_UPDATE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function stripCacheBustFromUrl() {
  const next = stripCacheBust(window.location.href);
  if (next !== window.location.href) {
    window.history.replaceState(null, "", next);
  }
}

async function clearAppCaches() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== NOTIF_SOUND_CACHE).map((k) => caches.delete(k)),
    );
  } catch {
    // Cache API can throw in some private-browsing modes.
  }
}

async function fetchVersionJson(): Promise<unknown | null> {
  const res = await fetch("/api/version", { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

async function hardNavigate(target: AppRelease) {
  await clearAppCaches();
  window.location.replace(withCacheBust(window.location.href, target.version));
}

/**
 * Watches for new deployments and prompts the user to update.
 *
 * Logo URLs from the same /api/version poll are applied live by
 * BrandingProvider — a logo swap is not an app update.
 *
 * `currentVersion` / `releasedAt` are baked into the page the user loaded.
 * BrandingProvider polls `/api/version`; we keep a single latest target by
 * `releasedAt` so older replicas never step the user through multiple prompts.
 */
export function UpdateNotifier({
  currentVersion,
  releasedAt,
}: {
  currentVersion: string;
  releasedAt: number;
}) {
  const branding = useBranding();
  const page: AppRelease = { version: currentVersion, releasedAt };
  const [pending, setPending] = useState<AppRelease | null>(null);
  const [applying, setApplying] = useState(false);
  const pendingRef = useRef<AppRelease | null>(null);
  pendingRef.current = pending;

  const applyLive = (data: unknown): AppRelease | null => {
    branding?.applyPayload(data);
    return parseRelease(data);
  };

  useEffect(() => {
    if (shouldSkipUpdateCheck(currentVersion)) return;

    const stored = readStored();
    const action = decideMountAction(page, stored);

    if (action.type === "caught_up") {
      clearStored();
      stripCacheBustFromUrl();
      return;
    }
    if (action.type === "silent_retry") {
      setApplying(true);
      let cancelled = false;
      (async () => {
        let target = action.target;
        try {
          const data = await fetchVersionJson();
          if (data) {
            const live = applyLive(data);
            if (live) {
              const latest = pickLatest(target, live);
              target = { ...latest, attempts: target.attempts };
            }
          }
        } catch {
          // Navigate to whatever we already stored.
        }
        if (cancelled) return;
        try {
          persist(target);
          await hardNavigate(target);
        } catch {
          if (!cancelled) {
            setPending(target);
            setApplying(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (action.type === "show_banner") {
      setPending(action.target);
    }
    // Mount-only: the baked page identity does not change without a navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (shouldSkipUpdateCheck(currentVersion)) return;
    const live = branding?.liveRelease;
    if (!live) return;
    const next = applyPoll(page, pendingRef.current, live);
    setPending(next);
    if (!next) {
      clearStored();
      stripCacheBustFromUrl();
    }
    // page identity is stable for this document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding?.liveRelease, currentVersion]);

  const update = async () => {
    if (applying) return;
    setApplying(true);
    try {
      let target = pendingRef.current;
      try {
        const data = await fetchVersionJson();
        if (data) {
          const live = applyLive(data);
          if (live) target = pickLatest(target, live);
        }
      } catch {
        // Use the banner target if the refresh fails.
      }
      if (!target || applyPoll(page, null, target) === null) {
        setPending(null);
        setApplying(false);
        clearStored();
        stripCacheBustFromUrl();
        return;
      }
      persist({ ...target, attempts: 1 });
      await hardNavigate(target);
    } catch {
      setApplying(false);
    }
  };

  if (applying || !pending) return null;

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
