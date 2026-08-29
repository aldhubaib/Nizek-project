"use client";

import { useEffect, useRef } from "react";

// Number of bars in the live recording waveform.
const VOICE_BAR_COUNT = 40;

// Live recording waveform. Runs its own RAF loop and writes bar heights straight
// to the DOM via refs, so the ~60fps updates never re-render the (huge) chat
// component. Only mounts while recording.
export function VoiceVisualizer({
  analyserRef,
  pausedRef,
  paused,
}: {
  analyserRef: React.RefObject<AnalyserNode | null>;
  pausedRef: React.RefObject<boolean>;
  paused: boolean;
}) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const levelsRef = useRef<number[]>(new Array(VOICE_BAR_COUNT).fill(0));

  useEffect(() => {
    const analyser = analyserRef.current;
    let raf = 0;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    const apply = (v: number, el: HTMLSpanElement | null) => {
      if (!el) return;
      el.style.height = `${Math.max(3, Math.round(v * 26))}px`;
      el.style.opacity = String(pausedRef.current ? 0.35 : 0.5 + v * 0.5);
    };
    const loop = () => {
      if (analyser && data && !pausedRef.current) {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        const level = Math.min(1, peak * 2.5);
        const shifted = levelsRef.current.slice(1);
        shifted.push(level);
        levelsRef.current = shifted;
        for (let i = 0; i < barsRef.current.length; i++) apply(shifted[i], barsRef.current[i]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef, pausedRef]);

  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center gap-[2px]"
      aria-hidden
    >
      {Array.from({ length: VOICE_BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="w-[2px] rounded-full bg-muted-foreground/70"
          style={{
            height: "3px",
            opacity: paused ? 0.35 : 0.5,
            transition: "height 90ms linear",
          }}
        />
      ))}
    </div>
  );
}
