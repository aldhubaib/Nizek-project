import { MAX_VOICE_NOTE_MS } from "@/lib/message-limits";

/** Most bars a stored waveform keeps. Players resample to their own width. */
export const MAX_WAVEFORM_BARS = 128;

/** A recorder-measured length in ms, or null when missing or implausible. */
export function cleanVoiceDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const ms = Math.round(value);
  // A little slack over the cap: the recorder stops on a timer tick.
  if (ms <= 0 || ms > MAX_VOICE_NOTE_MS + 5_000) return null;
  return ms;
}

/** Loudness bars as 0–100 ints, or null when it is not a usable list. */
export function cleanVoiceWaveform(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_WAVEFORM_BARS) return null;
  const bars: number[] = [];
  for (const v of value) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    bars.push(Math.min(100, Math.max(0, Math.round(v))));
  }
  return bars;
}

/** Bars a recorder stores with a note (same as the phone app). */
export const VOICE_WAVE_BARS = 48;

/**
 * Levels (0–1) sampled while recording, folded into peaks and scaled to the
 * loudest one so a quiet note still has a visible shape. 0–100 ints.
 */
export function summarizeVoiceLevels(levels: number[], bars = VOICE_WAVE_BARS): number[] {
  if (levels.length === 0) return new Array<number>(bars).fill(0);
  const peaks: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]);
    peaks.push(peak);
  }
  const loudest = Math.max(0.35, ...peaks);
  return peaks.map((p) => Math.round(Math.min(1, p / loudest) * 100));
}

/** Stored JSON back to bars; anything else reads as "no waveform". */
export function readVoiceWaveform(value: unknown): number[] | null {
  return cleanVoiceWaveform(value);
}
