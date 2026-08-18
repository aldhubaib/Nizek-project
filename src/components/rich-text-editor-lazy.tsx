"use client";

import dynamic from "next/dynamic";
import type { RichTextEditorProps } from "./rich-text-editor";

// Code-split the TipTap editor (StarterKit + extensions are heavy). It only
// loads when a task sidebar / detail / notes editor actually renders, keeping it
// out of the initial dashboard bundle. Client-only (no SSR for the editor).
export const RichTextEditor = dynamic<RichTextEditorProps>(
  () => import("./rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[120px] animate-pulse rounded-md bg-muted/40" />
    ),
  },
);
