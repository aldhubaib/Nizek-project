import * as React from "react";

import { QueryProvider } from "@/next-ui/lib/query-provider";
import { ViewerProvider, type Viewer } from "@/next-ui/lib/viewer";
import { AppSidebar, AppSidebarSkeleton } from "@/next-ui/shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/next-ui/ui/sidebar";
import { TooltipProvider } from "@/next-ui/ui/tooltip";

import { PaneLayout } from "./pane-layout";
import { PaneSidebarRestore } from "./pane-sidebar-restore";

/**
 * The app frame: the floating sidebar on the canvas and the two-column pane layout.
 *
 * Both halves read the URL's search params (`usePane`, `usePaneLocation`), and Next prerenders a
 * component that does so only behind a Suspense boundary. `PaneLayout` carries its own; the
 * sidebar gets one here with its skeleton as the fallback.
 */
export function PaneShell({
  viewer,
  defaultOpen = true,
  children,
}: {
  viewer: Viewer;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const userName = viewer.name || viewer.email || "there";
  const userEmail = viewer.email;
  const userImage = viewer.imageUrl;
  return (
    <QueryProvider>
      <ViewerProvider viewer={viewer}>
      {/* the new UI's tooltips are Radix; the live panel's provider (base-ui) does not serve them */}
      <TooltipProvider>
        <SidebarProvider
          defaultOpen={defaultOpen}
          className="bg-canvas"
          style={{ "--sidebar-width": "16.25rem" } as React.CSSProperties}
        >
          <React.Suspense fallback={<AppSidebarSkeleton />}>
            <AppSidebar userName={userName} userEmail={userEmail} userImage={userImage} />
          </React.Suspense>
          {/* the sidebar slides away; the panes then keep the same 8 px from the edge */}
          <SidebarInset className="min-w-0 bg-transparent md:peer-data-[collapsible=offcanvas]:pl-2">
            <PaneLayout>{children}</PaneLayout>
          </SidebarInset>
          <PaneSidebarRestore />
        </SidebarProvider>
      </TooltipProvider>
      </ViewerProvider>
    </QueryProvider>
  );
}
