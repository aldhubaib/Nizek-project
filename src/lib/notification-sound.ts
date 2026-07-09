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

/**
 * Plays a short two-tone chime using the Web Audio API (no asset needed).
 * Respects the user's per-device preference unless `force` is true (used for the
 * settings preview so the user can hear it even before toggling on).
 *
 * Browsers start an AudioContext "suspended" until a user gesture, and tones
 * scheduled into a suspended context are silent — so we resume first, then emit.
 */
export function playNotificationSound(force = false): void {
  if (!force && !isNotificationSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().then(() => emitChime(ctx)).catch(() => {});
  } else {
    emitChime(ctx);
  }
}

// Unlocks audio on the first user gesture so later (non-gesture) notifications
// can play. Autoplay policies only let us resume an AudioContext in response to
// a real interaction; after that it stays running for the session.
let unlockAttached = false;

export function primeNotificationAudio(): void {
  if (typeof window === "undefined" || unlockAttached) return;
  unlockAttached = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (!ctx) {
      detach();
      return;
    }
    if (ctx.state !== "running") {
      void ctx.resume().then(() => {
        if (ctx.state === "running") detach();
      });
    } else {
      detach();
    }
  };

  const detach = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}
