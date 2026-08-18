"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  filesFromClipboard,
  isEditablePasteTarget,
} from "@/lib/clipboard-files";

type PasteTarget = {
  ref: RefObject<HTMLElement | null>;
  capture: boolean;
  onFiles: (files: File[]) => void;
};

const targets = new Set<PasteTarget>();
let lastActive: PasteTarget | null = null;
let listening = false;

function innermostContaining(node: Node | null): PasteTarget | null {
  if (!node) return null;
  const containing = [...targets].filter(
    (t) => t.ref.current && t.ref.current.contains(node),
  );
  if (containing.length === 0) return null;
  containing.sort((a, b) => {
    const ae = a.ref.current!;
    const be = b.ref.current!;
    if (ae.contains(be)) return 1;
    if (be.contains(ae)) return -1;
    return 0;
  });
  return containing[0] ?? null;
}

function idleCaptureTarget(): PasteTarget | null {
  if (lastActive && targets.has(lastActive) && lastActive.capture) {
    return lastActive;
  }
  const capturers = [...targets].filter((t) => t.capture && t.ref.current);
  return capturers.at(-1) ?? null;
}

function onPointerDown(e: PointerEvent) {
  const match = innermostContaining(e.target instanceof Node ? e.target : null);
  if (match) lastActive = match;
}

function onPaste(e: ClipboardEvent) {
  if (e.defaultPrevented) return;
  const files = filesFromClipboard(e.clipboardData);
  if (files.length === 0) return;

  const node = e.target instanceof Node ? e.target : null;
  let match = innermostContaining(node);

  if (!match) {
    if (isEditablePasteTarget(e.target)) return;
    match = idleCaptureTarget();
  }
  if (!match) return;

  e.preventDefault();
  match.onFiles(files);
}

function startListening() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("paste", onPaste);
  document.addEventListener("pointerdown", onPointerDown, true);
}

function stopListening() {
  if (!listening || targets.size > 0) return;
  listening = false;
  document.removeEventListener("paste", onPaste);
  document.removeEventListener("pointerdown", onPointerDown, true);
  lastActive = null;
}

/**
 * Treat Cmd/Ctrl+V of a screenshot or copied file as an upload.
 *
 * Put the returned ref on the dropzone / composer. Pastes inside that node
 * always go here. With `capture`, pastes elsewhere on the page also land here
 * unless the user is typing in another field or another capture target was
 * clicked more recently.
 */
export function usePasteFiles<T extends HTMLElement = HTMLDivElement>(
  onFiles: (files: File[]) => void,
  options?: {
    enabled?: boolean;
    capture?: boolean;
    ref?: RefObject<T | null>;
  },
): RefObject<T | null> {
  const innerRef = useRef<T | null>(null);
  const ref = options?.ref ?? innerRef;
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const capture = options?.capture ?? false;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const target: PasteTarget = {
      ref: ref as RefObject<HTMLElement | null>,
      capture,
      onFiles: (files) => onFilesRef.current(files),
    };
    targets.add(target);
    startListening();
    return () => {
      targets.delete(target);
      if (lastActive === target) lastActive = null;
      stopListening();
    };
  }, [enabled, capture, ref]);

  return ref;
}
