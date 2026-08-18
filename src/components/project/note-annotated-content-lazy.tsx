"use client";

import dynamic from "next/dynamic";

export const NoteAnnotatedContent = dynamic(
  () => import("./note-annotated-content").then((m) => m.NoteAnnotatedContent),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[120px] animate-pulse rounded-md bg-muted/40" />
    ),
  },
);
