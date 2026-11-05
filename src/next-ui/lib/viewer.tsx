"use client";

import * as React from "react";

/** The signed-in person, as the `(next)` layout read them on the server. */
export interface Viewer {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
  /** Nizek's system role (`ADMIN`, `DEVELOPER`, ...); project rights come from the membership. */
  systemRole: string;
}

const ViewerContext = React.createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children?: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

/** The viewer, or `null` outside the shell (tests rendering a screen on its own). */
export function useViewer(): Viewer | null {
  return React.useContext(ViewerContext);
}

/** True for a system admin: the one role that sees and may change everything. */
export function useIsAdmin(): boolean {
  return useViewer()?.systemRole === "ADMIN";
}
