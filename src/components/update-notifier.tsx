"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// Primarily event-driven: we check on tab focus / visibility changes (which
// covers the common "user came back to the app" case). A long backstop interval
// catches deploys while the tab stays focused, without a chatty 60s poll.
const POLL_INTERVAL_MS = 10 * 60_000;

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

async function fetchLiveRelease(): Promise<{
  release: AppRelease;
  logo?: string;
} | null> {
  const res = await fetch("/api/version", { cache: "no-store" });
  if (!res.ok) return null;
  const data: unknown = await res.json();
  const release = parseRelease(data);
  if (!release) return null;
  const logo =
    data && typeof data === "object" && "logo" in data
      ? typeof (data as { logo: unknown }).logo === "string"
        ? (data as { logo: string }).logo
        : undefined
      : undefined;
  return { release, logo };
}

async function hardNavigate(target: AppRelease) {
  await clearAppCaches();
  window.location.replace(withCacheBust(window.location.href, target.version));
}

/**
 * Watches for new deployments and prompts the user to update.
 *
 * `currentVersion` / `releasedAt` are baked into the page the user loaded.
 * We poll `/api/version` (served by whatever container is currently live) and
 * keep a single latest target by `releasedAt`, so older replicas and
 * intermediate deploys never step the user through multiple prompts. "Update
 * now" hard-navigates to that target and silently retries if the next document
 * is still behind.
 */
export function UpdateNotifier({
  currentVersion,
  releasedAt,
}: {
  currentVersion: string;
  releasedAt: number;
}) {
  const page: AppRelease = { version: currentVersion, releasedAt };
  const [pending, setPending] = useState<AppRelease | null>(null);
  const [applying, setApplying] = useState(false);
  const pendingRef = useRef<AppRelease | null>(null);
  pendingRef.current = pending;

  const check = useCallback(async () => {
    try {
      const live = await fetchLiveRelease();
      if (!live) return;
      if (live.logo) setFavicon(live.logo);

      const next = applyPoll(page, pendingRef.current, live.release);
      setPending(next);
      if (!next) {
        clearStored();
        stripCacheBustFromUrl();
      }
    } catch {
      // Network hiccup — ignore and retry on the next interval.
    }
  }, [page.version, page.releasedAt]);

  useEffect(() => {
    if (shouldSkipUpdateCheck(currentVersion)) return;

    const stored = readStored();
    const action = decideMountAction(page, stored);

    if (action.type === "caught_up") {
      clearStored();
      stripCacheBustFromUrl();
    } else if (action.type === "silent_retry") {
      setApplying(true);
      let cancelled = false;
      (async () => {
        let target = action.target;
        try {
          const live = await fetchLiveRelease();
          if (live) {
            if (live.logo) setFavicon(live.logo);
            const latest = pickLatest(target, live.release);
            target = { ...latest, attempts: target.attempts };
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
    } else if (action.type === "show_banner") {
      setPending(action.target);
    }

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
    // Mount-only: the baked page identity does not change without a navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = async () => {
    if (applying) return;
    setApplying(true);
    try {
      let target = pendingRef.current;
      try {
        const live = await fetchLiveRelease();
        if (live) {
          if (live.logo) setFavicon(live.logo);
          target = pickLatest(target, live.release);
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
