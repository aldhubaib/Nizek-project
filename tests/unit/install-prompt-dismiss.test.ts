import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTALL_PROMPT_DISMISS_MS,
  INSTALL_PROMPT_DISMISSED_KEY,
  dismissInstallPrompt,
  isInstallPromptDismissed,
  resetInstallPromptDismiss,
} from "@/lib/install-prompt-dismiss";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
}

beforeEach(() => {
  stubStorage();
});

afterEach(() => {
  resetInstallPromptDismiss();
  vi.unstubAllGlobals();
});

describe("install prompt dismiss", () => {
  it("is not dismissed until the user closes it", () => {
    expect(isInstallPromptDismissed(1_000)).toBe(false);
  });

  it("stays hidden after close, including later beforeinstallprompt ticks", () => {
    dismissInstallPrompt(1_000);
    expect(isInstallPromptDismissed(1_001)).toBe(true);
    expect(isInstallPromptDismissed(1_000 + INSTALL_PROMPT_DISMISS_MS - 1)).toBe(
      true,
    );
  });

  it("can return after the cool-down", () => {
    dismissInstallPrompt(1_000);
    expect(isInstallPromptDismissed(1_000 + INSTALL_PROMPT_DISMISS_MS)).toBe(
      false,
    );
  });

  it("survives a remount via localStorage", () => {
    dismissInstallPrompt(5_000);
    resetInstallPromptDismiss();
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "5000");
    expect(isInstallPromptDismissed(5_001)).toBe(true);
  });
});
