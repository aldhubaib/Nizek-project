// @vitest-environment jsdom
// The sound library itself: preference storage and graceful playback fallback.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

async function freshModule() {
  vi.resetModules();
  return import("@/lib/notification-sound");
}

// Node's experimental `localStorage` global shadows jsdom's implementation and
// lacks the full Storage API — replace it with a real in-memory shim.
beforeAll(() => {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: shim, configurable: true });
});

beforeEach(() => {
  window.localStorage.removeItem("nizek-notification-sound");
});

describe("sound preference storage", () => {
  it("defaults to ON", async () => {
    const lib = await freshModule();
    expect(lib.isNotificationSoundEnabled()).toBe(true);
  });

  it("round-trips off/on", async () => {
    const lib = await freshModule();
    lib.setNotificationSoundEnabled(false);
    expect(lib.isNotificationSoundEnabled()).toBe(false);
    lib.setNotificationSoundEnabled(true);
    expect(lib.isNotificationSoundEnabled()).toBe(true);
  });

  it("survives corrupted storage values", async () => {
    const lib = await freshModule();
    window.localStorage.setItem("nizek-notification-sound", "garbage");
    expect(lib.isNotificationSoundEnabled()).toBe(true); // only exact "off" disables
  });
});

// Minimal HTMLAudioElement stand-in matching what the library touches.
function makeFakeAudio() {
  const play = vi.fn().mockResolvedValue(undefined);
  const constructed = vi.fn();
  class FakeAudio {
    preload = "";
    currentTime = 0;
    muted = false;
    src = "";
    paused = true;
    play = play;
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn((attr: string) => {
      if (attr === "src") this.src = "";
    });
    constructor() {
      constructed();
    }
  }
  return { FakeAudio, play, constructed };
}

describe("playNotificationSound", () => {
  it("does not throw when audio is unavailable (jsdom has no AudioContext)", async () => {
    const lib = await freshModule();
    expect(() => lib.playNotificationSound()).not.toThrow();
    expect(() => lib.playNotificationSound(true)).not.toThrow();
  });

  it("skips playback when disabled and not forced", async () => {
    const lib = await freshModule();
    lib.setNotificationSoundEnabled(false);

    const { FakeAudio, play } = makeFakeAudio();
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    lib.setCustomNotificationSound("https://cdn.example.com/notification_sound/x.mp3");
    lib.playNotificationSound();
    expect(play).not.toHaveBeenCalled();

    lib.playNotificationSound(true); // forced preview plays despite pref
    expect(play).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("plays the custom sound when enabled", async () => {
    const lib = await freshModule();

    const { FakeAudio, play } = makeFakeAudio();
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    lib.setCustomNotificationSound("https://cdn.example.com/notification_sound/y.mp3");
    lib.playNotificationSound();
    expect(play).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("reuses one Audio element across sound URL changes (keeps gesture unlock)", async () => {
    const lib = await freshModule();

    const { FakeAudio, constructed } = makeFakeAudio();
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    lib.setCustomNotificationSound("https://cdn.example.com/notification_sound/a.mp3");
    lib.setCustomNotificationSound("https://cdn.example.com/notification_sound/b.mp3");
    expect(constructed).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("falls back to no custom playback after the sound is removed", async () => {
    const lib = await freshModule();

    const { FakeAudio, play } = makeFakeAudio();
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    lib.setCustomNotificationSound("https://cdn.example.com/notification_sound/a.mp3");
    lib.setCustomNotificationSound(null);
    lib.playNotificationSound();
    expect(play).not.toHaveBeenCalled(); // chime path (no AudioContext in jsdom)

    vi.unstubAllGlobals();
  });

  it("unlocks a custom sound that loads AFTER priming, on the next gesture", async () => {
    const lib = await freshModule();

    const { FakeAudio, play } = makeFakeAudio();
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));

    // Prime first (as the app does on mount), then the sound URL arrives async
    // — the regression this guards: a one-shot unlock would have missed it.
    lib.primeNotificationAudio();
    window.dispatchEvent(new Event("pointerdown")); // gesture before sound exists

    lib.setCustomNotificationSound("https://cdn.example.com/notification_sound/late.mp3");
    expect(play).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pointerdown")); // next gesture unlocks it
    expect(play).toHaveBeenCalledTimes(1);
    await Promise.resolve(); // let the unlock's play() promise settle

    // Once unlocked, further gestures don't re-play.
    window.dispatchEvent(new Event("pointerdown"));
    expect(play).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("getAudioReadiness reports unavailable in jsdom", async () => {
    const lib = await freshModule();
    expect(lib.getAudioReadiness()).toBe("unavailable");
  });
});
