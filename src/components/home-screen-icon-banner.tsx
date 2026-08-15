"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { useBranding } from "@/components/branding-provider";
import { isStandaloneDisplayMode } from "@/lib/push-client";
import {
  decideHomeScreenBanner,
  isIosUserAgent,
  HOME_SCREEN_ICON_TOKEN_KEY,
} from "@/lib/home-screen-icon-update";

function readStored(): string | null {
  try {
    return localStorage.getItem(HOME_SCREEN_ICON_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStored(token: string) {
  try {
    localStorage.setItem(HOME_SCREEN_ICON_TOKEN_KEY, token);
  } catch {
    // Private mode / quota.
  }
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIosUserAgent(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
}

/**
 * Installed-PWA prompt after an admin logo upload. Chrome 144+ will not
 * change the launcher glyph until the user reviews the identity update;
 * iOS often still needs a re-add.
 */
export function HomeScreenIconBanner() {
  const branding = useBranding();
  const token = branding?.logos.iconToken ?? null;
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = isStandaloneDisplayMode();
    setIos(detectIos());
    const action = decideHomeScreenBanner({
      currentToken: token,
      storedToken: readStored(),
      standalone,
    });
    if (action === "seed" && token) writeStored(token);
    setVisible(action === "show");
  }, [token]);

  const dismiss = () => {
    if (token) writeStored(token);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[1000] w-[calc(100%-2rem)] max-w-[320px] animate-in fade-in slide-in-from-bottom-2">
      <div className="rounded-xl border border-border bg-card shadow-lg shadow-black/40 p-3.5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-primary" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              Home-screen icon updated
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">
              {ios
                ? "The logo inside the app is updated. If the home-screen glyph is still old after you reopen, remove the app and add it again from Safari."
                : "Tap the ⋮ menu → Review app update, then fully close the app on Wi‑Fi."}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={dismiss}
                className="h-7 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/80 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
