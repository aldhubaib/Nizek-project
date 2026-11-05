"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight, PanelRight } from "lucide-react";

import { useProjectBrief } from "@/next-ui/data/projects";
import { cn } from "@/next-ui/lib/cn";
import { useIsAdmin } from "@/next-ui/lib/viewer";
import { AppLink, entryFromHref, isPaneKind, usePane } from "@/next-ui/panes";
import { ProjectAvatar } from "@/next-ui/patterns/project-avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/next-ui/ui/sidebar";
import { Skeleton } from "@/next-ui/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

import {
  ADMIN_ITEM,
  ADMIN_NAV,
  NAV,
  isAdminPath,
  navIsActive,
  projectIdOf,
  projectNavHref,
  projectNavIsActive,
  visibleProjectNav,
  type NavGroup,
} from "./nav";
import { SidebarBrand } from "./sidebar-brand";
import { UserMenu } from "./user-menu";

/**
 * The sidebar's frame while the real one waits for the URL: `AppSidebar` reads the search params
 * (through `usePane`), which Next only prerenders behind a Suspense boundary — `PaneShell` puts
 * this skeleton in that boundary's fallback.
 */
export function AppSidebarSkeleton() {
  return (
    <Sidebar variant="floating" collapsible="offcanvas" aria-busy>
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-1">
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {Array.from({ length: 8 }, (_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Skeleton className="h-8 w-full rounded-full" />
      </SidebarFooter>
    </Sidebar>
  );
}

type View = "main" | "project" | "admin";

/** Air between the rows of every list (the primitive packs them); the same in all so a swap does not shift. */
const LIST_GAP = "gap-2";

/**
 * The floating sidebar, as in Social AI: one header row (brand + ⌘K), the nav groups, and a
 * footer row with the user pill and the trigger that slides the sidebar away. Each row has an
 * "Open in pane" hover action; ⌥-click does the same.
 *
 * Three lists, swapped in place (Social AI's admin-menu pattern): the main list; while a
 * project is open in the main pane, that project's menu; and for system admins the
 * Administrator menu — the operator's pages behind one row at the foot of the main list. A
 * menu follows the page (a project page, an admin page); the back arrow shows the main list by
 * hand, the row at the foot brings the menu back, and the hand choice holds until the page
 * changes context. Nothing is stored.
 */
export function AppSidebar({
  userName,
  userEmail,
  userImage,
}: {
  userName: string;
  userEmail: string;
  userImage?: string;
}) {
  const pathname = usePathname();
  const pane = usePane();
  const isAdmin = useIsAdmin();
  const projectId = projectIdOf(pathname);
  const adminPath = isAdmin && isAdminPath(pathname);
  // what the page implies, and a key for it: the hand choice lapses when the page leaves that context
  const implied: View = projectId ? "project" : adminPath ? "admin" : "main";
  const context = projectId ?? (adminPath ? "admin" : "main");
  const [choice, setChoice] = React.useState<{ context: string; view: View } | null>(null);
  const chosen = choice?.context === context ? choice.view : implied;
  const view: View = chosen === "admin" && !isAdmin ? "main" : chosen === "project" && !projectId ? "main" : chosen;
  const show = (v: View) => setChoice({ context, view: v });

  return (
    <Sidebar variant="floating" collapsible="offcanvas" data-view={view}>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent
        onKeyDown={(e) => {
          // Escape while the sidebar has focus returns to the main list
          if (e.key === "Escape" && view !== "main") {
            e.preventDefault();
            show("main");
          }
        }}
      >
        {view === "project" && projectId ? (
          <ProjectMenu projectId={projectId} pathname={pathname} onBack={() => show("main")} />
        ) : view === "admin" ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => show("main")}
                      tooltip="Back to the main menu"
                      aria-label="Back to the main menu"
                      data-testid="nav-back"
                      className="font-medium"
                    >
                      <ArrowLeft />
                      <span>{ADMIN_ITEM.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <NavGroups groups={ADMIN_NAV} pathname={pathname} />
          </>
        ) : (
          <>
            <NavGroups groups={NAV} pathname={pathname} />
            {(projectId || isAdmin) && (
              <>
                <SidebarSeparator className="mt-auto" />
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu className={LIST_GAP}>
                      {projectId && (
                        <SidebarMenuItem>
                          <ProjectRow projectId={projectId} onClick={() => show("project")} testId="nav-project" isActive>
                            <ChevronRight className="ml-auto" />
                          </ProjectRow>
                        </SidebarMenuItem>
                      )}
                      {isAdmin && (
                        <SidebarMenuItem>
                          {/* a link: the row opens the Administrator index, and the page brings the menu with it */}
                          <SidebarMenuButton asChild isActive={isAdminPath(pathname)} tooltip={ADMIN_ITEM.title} data-testid="nav-admin">
                            <AppLink href={ADMIN_ITEM.href} onClick={(e) => !e.altKey && show("admin")}>
                              <ADMIN_ITEM.icon />
                              <span>{ADMIN_ITEM.title}</span>
                              <ChevronRight className="ml-auto transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0" />
                            </AppLink>
                          </SidebarMenuButton>
                          <OpenInPane title={ADMIN_ITEM.title} onClick={() => pane.openSide(ADMIN_ITEM.href)} />
                        </SidebarMenuItem>
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-0.5">
          <div className="min-w-0 flex-1">
            <UserMenu name={userName} email={userEmail} image={userImage} />
          </div>
          <SidebarTrigger className="text-muted-foreground" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** The rows of the nav: `SidebarMenuButton` with an `AppLink`, the "Open in pane" hover action and ⌥-click. */
function NavGroups({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  const pane = usePane();
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label ?? group.items[0]?.href}>
          {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu className={LIST_GAP}>
              {group.items.map((item) => {
                const active = navIsActive(pathname, item.href);
                const entry = entryFromHref(item.href);
                const beside = !!entry && isPaneKind(entry.kind);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <AppLink href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </AppLink>
                    </SidebarMenuButton>
                    {beside && <OpenInPane title={item.title} onClick={() => pane.openSide(item.href)} />}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function OpenInPane({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarMenuAction showOnHover aria-label={`Open ${title} in pane`} onClick={onClick}>
          <PanelRight />
        </SidebarMenuAction>
      </TooltipTrigger>
      <TooltipContent side="right">Open in pane · ⌥ click</TooltipContent>
    </Tooltip>
  );
}

/**
 * The project menu: the project's name behind a back arrow (the row returns to the main list),
 * then its views — About, Road map, Active sprint, Assets, Notes, Team, Vault, Settings — with
 * the same rows, hover action and ⌥-click as the main list. A project without sprints has no
 * Road map, Active sprint or Notes.
 */
function ProjectMenu({ projectId, pathname, onBack }: { projectId: string; pathname: string; onBack: () => void }) {
  const pane = usePane();
  const brief = useProjectBrief(projectId);
  const items = visibleProjectNav(brief?.sprintsEnabled ?? true);
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <ProjectRow projectId={projectId} onClick={onBack} testId="nav-back" back />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu aria-label="Project menu" className={LIST_GAP}>
            {items.map((item) => {
              const href = projectNavHref(projectId, item);
              const count = item.count ? brief?.counts[item.count] : undefined;
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={projectNavIsActive(pathname, projectId, item)} tooltip={item.title}>
                    <AppLink href={href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </AppLink>
                  </SidebarMenuButton>
                  {count != null && count > 0 && (
                    // the hover action lands on the same spot; the count steps aside for it
                    <SidebarMenuBadge className="text-muted-foreground transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0">
                      {count}
                    </SidebarMenuBadge>
                  )}
                  <OpenInPane title={item.title} onClick={() => pane.openSide(href)} />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

/**
 * The project's row: its logo and name. With `back` it heads the project menu (arrow first,
 * click returns to the main list); otherwise it sits at the foot of the main list while a
 * project is open, and click brings the project menu back.
 */
function ProjectRow({
  projectId,
  onClick,
  testId,
  back,
  isActive,
  children,
}: {
  projectId: string;
  onClick: () => void;
  testId: string;
  back?: boolean;
  isActive?: boolean;
  children?: React.ReactNode;
}) {
  const brief = useProjectBrief(projectId);
  const name = brief?.name ?? "Project";
  const label = back ? "Back to the main menu" : `${name} menu`;
  return (
    <SidebarMenuButton
      onClick={onClick}
      isActive={isActive}
      tooltip={label}
      aria-label={label}
      data-testid={testId}
      className={cn(back && "font-medium")}
    >
      {back && <ArrowLeft />}
      {brief ? (
        <ProjectAvatar name={brief.name} logoUrl={brief.logoUrl} className="size-5 rounded-md text-[10px]" />
      ) : (
        <Skeleton className="size-5 rounded-md" />
      )}
      <span className="truncate" dir="auto">
        {name}
      </span>
      {children}
    </SidebarMenuButton>
  );
}
