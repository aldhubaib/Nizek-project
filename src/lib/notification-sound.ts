"use client";

// Per-device preference (matches the app's localStorage pattern). Sound is ON
// unless the user explicitly turns it off.
const SOUND_PREF_KEY = "nizek-notification-sound";

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? "on" : "off");
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// Admin-configured custom sound. When set, it plays instead of the generated
// chime. Stored module-level so any caller (component or settings preview) uses
// the same one.
let customSoundUrl: string | null = null;
let customAudio: HTMLAudioElement | null = null;
// Safari/iOS only allow play() on elements that have already played inside a
// user gesture. Tracked per-element; reset if we ever recreate the element.
let customAudioUnlocked = false;

export function setCustomNotificationSound(url: string | null): void {
  if (typeof window === "undefined") return;
  if (url === customSoundUrl) return;
  customSoundUrl = url;
  if (url) {
    // Reuse ONE element and swap its src: a gesture-unlock sticks to the
    // element, so this keeps working when the sound URL changes later (the
    // URL arrives async after mount, and admins can swap it live). A fresh
    // element per URL would need a brand-new gesture each time.
    if (!customAudio) {
      customAudio = new Audio();
      customAudio.preload = "auto";
      customAudioUnlocked = false;
    }
    customAudio.src = url;
    try {
      customAudio.load();
    } catch {
      /* ignore */
    }
    // Warm the service-worker / HTTP cache so playback is instant and works
    // offline. no-cors keeps it a simple GET the SW can store as an opaque
    // response; failures are harmless (we still preload via the Audio element).
    try {
      void fetch(url, { mode: "no-cors", cache: "force-cache" });
    } catch {
      /* ignore */
    }
  } else if (customAudio) {
    // Keep the (possibly unlocked) element around in case a sound is set again
    // later; just drop the source so nothing can play meanwhile.
    try {
      customAudio.removeAttribute("src");
      customAudio.load();
    } catch {
      /* ignore */
    }
  }
}

// Lazily created and reused so we don't spawn an AudioContext per chime.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

function emitChime(ctx: AudioContext): void {
  try {
    const now = ctx.currentTime;
    const tones = [
      { freq: 880, start: 0, dur: 0.15 },
      { freq: 1318.51, start: 0.11, dur: 0.26 },
    ];
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const start = now + t.start;
      const end = start + t.dur;
      osc.frequency.setValueAtTime(t.freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    /* audio unavailable — fail silently */
  }
}

function playChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().then(() => emitChime(ctx)).catch(() => {});
  } else {
    emitChime(ctx);
  }
}

/**
 * Plays the notification sound: the admin-uploaded custom audio if configured,
 * otherwise a short two-tone chime via the Web Audio API (no asset needed).
 * Respects the user's per-device preference unless `force` is true (used for the
 * settings preview so the user can hear it even before toggling on).
 *
 * Browsers start audio "suspended" until a user gesture, so we resume/unlock
 * first (see primeNotificationAudio) and fall back to the chime if the custom
 * clip can't play.
 */
export function playNotificationSound(force = false): void {
  if (!force && !isNotificationSoundEnabled()) return;
  if (customAudio && customSoundUrl) {
    try {
      customAudio.currentTime = 0;
      const p = customAudio.play();
      if (p && typeof p.catch === "function") p.catch(() => playChime());
      return;
    } catch {
      /* fall through to the generated chime */
    }
  }
  playChime();
}

export type AudioReadiness = "unlocked" | "suspended" | "unavailable";

/**
 * How ready the audio pipeline is to actually produce sound right now. Used by
 * the account diagnostics panel to explain "why didn't I hear a chime".
 */
export function getAudioReadiness(): AudioReadiness {
  const ctx = getAudioContext();
  if (!ctx) return "unavailable";
  return ctx.state === "running" ? "unlocked" : "suspended";
}

// Unlocks audio on user gestures so later (non-gesture) notifications can play.
// Autoplay policies only allow this in response to a real interaction. The
// listeners stay attached for the whole session (they no-op once everything is
// unlocked): the custom sound element is (re)created ASYNCHRONOUSLY after mount
// — and can be swapped live by an admin — so a one-shot unlock on the first
// gesture would miss it and the uploaded sound would never play on Safari/iOS.
let unlockAttached = false;

export function primeNotificationAudio(): void {
  if (typeof window === "undefined" || unlockAttached) return;
  unlockAttached = true;

  const unlock = () => {
    // Unlock the custom HTMLAudioElement (autoplay policy) by doing a silent
    // play/pause during this gesture so later programmatic plays are allowed.
    // Skipped once unlocked, when there's no source yet, or while it is
    // audibly playing a real notification (pausing would cut it off).
    const el = customAudio;
    if (el && !customAudioUnlocked && customSoundUrl && el.paused) {
      const wasMuted = el.muted;
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          customAudioUnlocked = true;
          el.pause();
          el.currentTime = 0;
          el.muted = wasMuted;
        }).catch(() => {
          el.muted = wasMuted;
        });
      } else {
        customAudioUnlocked = true;
        el.muted = wasMuted;
      }
    }

    const ctx = getAudioContext();
    if (ctx && ctx.state !== "running") {
      void ctx.resume().catch(() => {});
    }
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}
