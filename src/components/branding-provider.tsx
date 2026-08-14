"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { parseRelease, type AppRelease } from "@/lib/app-release";
import {
  applyDocumentLogos,
  logosEqual,
  parseLiveLogos,
  type LiveLogos,
} from "@/lib/live-branding";

const POLL_INTERVAL_MS = 60_000;

type BrandingContextValue = {
  logos: LiveLogos;
  liveRelease: AppRelease | null;
  applyPayload: (data: unknown) => void;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function useBranding(): BrandingContextValue | null {
  return useContext(BrandingContext);
}

/** In-app mark: live URL from the poll, then the SSR fallback. */
export function useAppLogo(fallback?: string | null): string | null {
  const ctx = useContext(BrandingContext);
  return ctx?.logos.webLogo ?? fallback ?? null;
}

export function BrandingProvider({
  initialLogos,
  children,
}: {
  initialLogos: LiveLogos;
  children: ReactNode;
}) {
  const [logos, setLogos] = useState<LiveLogos>(initialLogos);
  const [liveRelease, setLiveRelease] = useState<AppRelease | null>(null);

  const applyPayload = useCallback((data: unknown) => {
    const nextLogos = parseLiveLogos(data);
    if (nextLogos) {
      applyDocumentLogos(nextLogos);
      setLogos((prev) => (logosEqual(prev, nextLogos) ? prev : nextLogos));
    }
    const release = parseRelease(data);
    if (release) setLiveRelease(release);
  }, []);

  useEffect(() => {
    setLogos((prev) => (logosEqual(prev, initialLogos) ? prev : initialLogos));
    applyDocumentLogos(initialLogos);
  }, [initialLogos]);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        applyPayload(await res.json());
      } catch {
        // Network hiccup — retry on the next interval / focus.
      }
    };

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
    // Mount-only poll; applyPayload is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyPayload]);

  const value = useMemo(
    () => ({ logos, liveRelease, applyPayload }),
    [logos, liveRelease, applyPayload],
  );

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}
