import { describe, expect, it } from "vitest";
import {
  MAX_WAVEFORM_BARS,
  VOICE_WAVE_BARS,
  cleanVoiceDuration,
  cleanVoiceWaveform,
  readVoiceWaveform,
  summarizeVoiceLevels,
} from "@/lib/voice-note-meta";
import { MAX_VOICE_NOTE_MS } from "@/lib/message-limits";

describe("cleanVoiceDuration", () => {
  it("keeps a plausible length, rounded", () => {
    expect(cleanVoiceDuration(14_400.6)).toBe(14_401);
    expect(cleanVoiceDuration(MAX_VOICE_NOTE_MS)).toBe(MAX_VOICE_NOTE_MS);
  });

  it("drops missing, non-numeric, zero, negative and over-cap values", () => {
    expect(cleanVoiceDuration(undefined)).toBeNull();
    expect(cleanVoiceDuration("1200")).toBeNull();
    expect(cleanVoiceDuration(Number.NaN)).toBeNull();
    expect(cleanVoiceDuration(0)).toBeNull();
    expect(cleanVoiceDuration(-5)).toBeNull();
    expect(cleanVoiceDuration(MAX_VOICE_NOTE_MS + 60_000)).toBeNull();
  });
});

describe("cleanVoiceWaveform", () => {
  it("clamps and rounds bars to 0–100", () => {
    expect(cleanVoiceWaveform([0, 12.4, 120, -3])).toEqual([0, 12, 100, 0]);
  });

  it("rejects anything that is not a short list of numbers", () => {
    expect(cleanVoiceWaveform(null)).toBeNull();
    expect(cleanVoiceWaveform([])).toBeNull();
    expect(cleanVoiceWaveform([1, "2", 3])).toBeNull();
    expect(cleanVoiceWaveform({ 0: 1 })).toBeNull();
    expect(cleanVoiceWaveform(new Array(MAX_WAVEFORM_BARS + 1).fill(5))).toBeNull();
  });

  it("folds recorded levels into scaled peaks", () => {
    const bars = summarizeVoiceLevels([0.1, 0.2, 0.05, 0.4], 2);
    expect(bars).toEqual([50, 100]);
    expect(summarizeVoiceLevels([], 4)).toEqual([0, 0, 0, 0]);
    expect(summarizeVoiceLevels(new Array(500).fill(0.5))).toHaveLength(VOICE_WAVE_BARS);
  });

  it("reads stored JSON the same way", () => {
    expect(readVoiceWaveform([10, 20])).toEqual([10, 20]);
    expect(readVoiceWaveform("oops")).toBeNull();
  });
});
