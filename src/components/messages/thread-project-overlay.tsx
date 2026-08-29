"use client";

import { createRoot, type Root } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { ClientProjectPanel } from "@/components/messages/client-project-panel";
import { NoteSlideOver } from "@/components/project/note-slide-over";

type ProjectTab = "dashboard" | "roadmap";

export type ThreadProjectOverlayProps = {
  projectId: string;
  tab: ProjectTab;
  onTabChange: (tab: ProjectTab) => void;
  onClose: () => void;
  instant?: boolean;
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let open = false;

function Overlay({
  projectId,
  tab,
  onTabChange,
  onClose,
  instant,
}: ThreadProjectOverlayProps) {
  return (
    <NoteSlideOver
      title="My project"
      onClose={onClose}
      instant={instant}
      allowOverflowX={tab === "roadmap"}
      bodyClassName={
        tab === "roadmap"
          ? undefined
          : "flex min-h-0 min-w-0 flex-col overflow-hidden"
      }
      headerRight={
        <Button
          type="button"
          size="sm"
          onClick={() =>
            onTabChange(tab === "dashboard" ? "roadmap" : "dashboard")
          }
        >
          {tab === "dashboard" ? "Road map" : "Dashboard"}
        </Button>
      }
    >
      <ClientProjectPanel
        projectId={projectId}
        tab={tab}
        onTabChange={onTabChange}
      />
    </NoteSlideOver>
  );
}

function ensureRoot() {
  if (host && root) return;
  host = document.createElement("div");
  host.id = "thread-project-overlay";
  document.body.appendChild(host);
  root = createRoot(host);
}

/** Keep My project on a root that survives ThreadChat remounts (refresh / Strict Mode). */
export function mountThreadProjectOverlay(props: ThreadProjectOverlayProps) {
  if (typeof document === "undefined") return;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  const instant = Boolean(props.instant || open);
  open = true;
  ensureRoot();
  root!.render(<Overlay {...props} instant={instant} />);
}

export function unmountThreadProjectOverlay() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    open = false;
    root?.render(null);
  }, 0);
}
