"use client";

import dynamic from "next/dynamic";

export const TaskAnnotatedContent = dynamic(
  () => import("./task-annotated-content").then((m) => m.TaskAnnotatedContent),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[48px] animate-pulse rounded-md bg-muted/40" />
    ),
  },
);
