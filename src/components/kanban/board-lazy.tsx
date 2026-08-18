"use client";

import dynamic from "next/dynamic";
import type { BoardProps } from "./board";

// Code-split the kanban board (@dnd-kit + board/column/card tree). It's a
// client-only interactive surface, so we skip SSR and defer the JS until the
// project page mounts the board.
export const KanbanBoard = dynamic<BoardProps>(
  () => import("./board").then((m) => m.KanbanBoard),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center py-xl text-s text-muted-foreground">
        Loading board…
      </div>
    ),
  },
);
