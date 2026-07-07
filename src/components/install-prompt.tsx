"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

const DISMISSED_KEY = "nizek-install-dismissed-at";
const DISMISS_DAYS = 30;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
  return Date.now() < at + DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Prompts the user to install the app to their device. Uses the native
 * `beforeinstallprompt` flow on Chromium browsers; on iOS Safari (which never
 * fires that event) it shows the manual "Add to Home Screen" instructions.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari has no install event — detect it and surface manual steps.
    const ua = window.navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if (isIos && isSafari) {
      setShowIosHint(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }, [deferred]);

  if (!visible || (!deferred && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-[9998] flex justify-center animate-in slide-in-from-bottom-4 fade-in duration-300 sm:inset-x-0">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-foreground shadow-2xl">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Download className="h-5 w-5" />
        </div>
        {showIosHint ? (
          <span className="min-w-0 flex-1 text-sm">
            Install this app: tap{" "}
            <Share className="inline h-3.5 w-3.5 -translate-y-0.5" /> then{" "}
            <span className="font-semibold">
              Add to Home Screen <Plus className="inline h-3.5 w-3.5 -translate-y-0.5" />
            </span>
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-sm font-medium">
              Install Nizek on your device
            </span>
            <button
              onClick={install}
              className="flex h-9 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Install
            </button>
          </>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
