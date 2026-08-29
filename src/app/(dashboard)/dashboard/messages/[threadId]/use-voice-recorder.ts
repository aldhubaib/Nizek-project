"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * WhatsApp-style hold-to-record voice notes. Owns the MediaRecorder, the
 * elapsed timer, the AnalyserNode that feeds the live waveform, and the
 * pointer tracking for hold + slide-to-cancel.
 *
 * `onSend` receives the finished audio File; the caller decides how to deliver
 * it (normally by enqueuing it on the outbox as an attachment).
 */
export function useVoiceRecorder({ onSend }: { onSend: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [recordPaused, setRecordPaused] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [holdRecording, setHoldRecording] = useState(false);
  const [slideCancelArmed, setSlideCancelArmed] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRecordingRef = useRef(false);
  const recordStartedAtRef = useRef(0);
  const recordAccumulatedRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordPausedRef = useRef(false);
  const holdStartXRef = useRef<number | null>(null);
  /** Set when pointer-up happens before MediaRecorder is ready. */
  const holdEndedRef = useRef<{ ended: boolean; cancel: boolean }>({
    ended: false,
    cancel: false,
  });

  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const cleanupRecordingResources = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const stopRecording = useCallback((sendIt: boolean) => {
    discardRecordingRef.current = !sendIt;
    try {
      if (recorderRef.current?.state === "paused") recorderRef.current.resume();
      recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;
    setRecording(false);
    setRecordPaused(false);
    recordPausedRef.current = false;
  }, []);

  const startRecording = useCallback(async () => {
    if (recorderRef.current) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordError("Voice recording is not supported in this browser.");
      setTimeout(() => setRecordError(null), 4000);
      return;
    }
    holdEndedRef.current = { ended: false, cancel: false };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pointer already released while waiting for mic permission.
      if (holdEndedRef.current.ended) {
        stream.getTracks().forEach((t) => t.stop());
        setHoldRecording(false);
        return;
      }
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recordChunksRef.current = [];
      discardRecordingRef.current = false;
      recordAccumulatedRef.current = 0;
      recordPausedRef.current = false;
      setRecordPaused(false);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        cleanupRecordingResources();
        if (!discardRecordingRef.current && recordChunksRef.current.length > 0) {
          const type = rec.mimeType || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const stamp = new Date();
          const name = `Voice message ${stamp.toLocaleDateString()} ${stamp
            .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            .replace(/:/g, ".")}.${ext}`;
          const file = new File([new Blob(recordChunksRef.current, { type })], name, { type });
          onSendRef.current(file);
        }
        recordChunksRef.current = [];
      };
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {}
      recorderRef.current = rec;
      rec.start(250);
      recordStartedAtRef.current = Date.now();
      setRecordSecs(0);
      setRecording(true);
      recordTimerRef.current = setInterval(() => {
        const running = recordStartedAtRef.current
          ? Date.now() - recordStartedAtRef.current
          : 0;
        setRecordSecs(Math.floor((recordAccumulatedRef.current + running) / 1000));
      }, 250);
      if (holdEndedRef.current.ended) {
        stopRecording(!holdEndedRef.current.cancel);
      }
    } catch {
      setHoldRecording(false);
      setRecordError(
        "Microphone access was denied. Allow it in your browser settings to send voice messages.",
      );
      setTimeout(() => setRecordError(null), 5000);
    }
  }, [cleanupRecordingResources, stopRecording]);

  const togglePauseRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      recordAccumulatedRef.current += Date.now() - recordStartedAtRef.current;
      recordStartedAtRef.current = 0;
      recordPausedRef.current = true;
      setRecordPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      recordStartedAtRef.current = Date.now();
      recordPausedRef.current = false;
      setRecordPaused(false);
    }
  }, []);

  // Hold-to-record: track pointer on window so the composer UI can swap to the
  // recording bar without losing pointerup / slide-to-cancel.
  const onMicPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      holdStartXRef.current = e.clientX;
      setSlideCancelArmed(false);
      setHoldRecording(true);
      let cancelled = false;
      const onMove = (ev: PointerEvent) => {
        if (holdStartXRef.current == null) return;
        const dx = ev.clientX - holdStartXRef.current;
        cancelled = dx < -80;
        setSlideCancelArmed(cancelled);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setHoldRecording(false);
        setSlideCancelArmed(false);
        holdStartXRef.current = null;
        if (recorderRef.current) {
          stopRecording(!cancelled);
        } else {
          // Mic permission / recorder still starting — finish when ready.
          holdEndedRef.current = { ended: true, cancel: cancelled };
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      void startRecording();
    },
    [startRecording, stopRecording],
  );

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
      try {
        recorderRef.current?.stop();
      } catch {}
    };
  }, []);

  return {
    recording,
    recordPaused,
    recordSecs,
    recordError,
    holdRecording,
    slideCancelArmed,
    analyserRef,
    recordPausedRef,
    startRecording,
    stopRecording,
    togglePauseRecording,
    onMicPointerDown,
  };
}
