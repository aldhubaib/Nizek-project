"use client";

import * as React from "react";

import { ComingSoon } from "@/next-ui/patterns/coming-soon";
import { AdminScreen } from "@/next-ui/screens/admin/admin-screen";
import { DashboardScreen } from "@/next-ui/screens/dashboard-screen";
import { NoteScreen } from "@/next-ui/screens/projects/note-screen";
import { ProjectScreen } from "@/next-ui/screens/projects/project-screen";
import { ProjectsScreen } from "@/next-ui/screens/projects/projects-screen";
import { TaskScreen } from "@/next-ui/screens/projects/task-screen";
import { Skeleton } from "@/next-ui/ui/skeleton";

import { paneTitle } from "./pane-registry";
import type { PaneEntry } from "./pane-url";

/**
 * `(kind, id)` → the same screen the file route renders (panes brief, decision 7). This is the
 * only file in the pane system that imports screens. A section without a screen yet shows the
 * "not built yet" placeholder.
 */
export function PaneRouter({ entry }: { entry: PaneEntry }) {
  return <React.Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>{render(entry)}</React.Suspense>;
}

const SECTIONS: Record<string, React.ComponentType> = {
  dashboard: DashboardScreen,
  projects: ProjectsScreen,
};

function render(entry: PaneEntry) {
  const id = entry.id ?? "";
  const Section = SECTIONS[entry.kind];
  if (Section) return <Section />;
  switch (entry.kind) {
    case "project":
      return <ProjectScreen id={id} view={entry.view} />;
    case "admin":
      return <AdminScreen view={entry.view} />;
    case "task":
      return <TaskScreen id={id} />;
    case "note":
      return <NoteScreen id={id} />;
    default:
      return <ComingSoon title={paneTitle(entry)} />;
  }
}
