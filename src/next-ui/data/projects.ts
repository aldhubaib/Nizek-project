"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getProject, getProjectInvitations, getProjects } from "@/actions/project";

/**
 * Projects, as the new UI reads them: the existing server actions behind react-query. The list
 * and a record share one cache, so a project opened beside the list paints at once, and the
 * breadcrumb takes its label from the same data the screen uses (no request of its own).
 */

export type ProjectRow = Awaited<ReturnType<typeof getProjects>>[number];
export type ProjectDetail = Awaited<ReturnType<typeof getProject>>;
export type ProjectInvitation = Awaited<ReturnType<typeof getProjectInvitations>>[number];

export const PROJECTS_KEY = ["projects"] as const;
export const projectKey = (id: string) => ["projects", id] as const;
export const projectInvitationsKey = (id: string) => ["projects", id, "invitations"] as const;

/** The project's pending invitations (Team view). */
export function useProjectInvitations(projectId: string) {
  return useQuery({
    queryKey: projectInvitationsKey(projectId),
    queryFn: () => getProjectInvitations(projectId),
    enabled: projectId !== "",
    staleTime: 30_000,
  });
}

export function useProjects() {
  return useQuery({ queryKey: PROJECTS_KEY, queryFn: () => getProjects() });
}

export function useProject(id: string) {
  return useQuery({ queryKey: projectKey(id), queryFn: () => getProject(id), enabled: id !== "" });
}

/** The project's name for the breadcrumb and the tray: from the list when it is loaded, else the record. */
export function useProjectLabel(id: string): string | undefined {
  const qc = useQueryClient();
  const fromList = qc.getQueryData<ProjectRow[]>(PROJECTS_KEY)?.find((p) => p.id === id)?.name;
  const record = useQuery({
    queryKey: projectKey(id),
    queryFn: () => getProject(id),
    enabled: id !== "" && !fromList,
    select: (p) => p.name,
  });
  return record.data ?? fromList;
}

/** What the sidebar's project menu needs of a project: its name and logo, whether it runs sprints, a few counts. */
export interface ProjectBrief {
  name: string;
  logoUrl: string | null;
  sprintsEnabled: boolean;
  counts: { notes: number; assets: number; members: number };
}

function brief(p: ProjectRow | ProjectDetail): ProjectBrief {
  return {
    name: p.name,
    logoUrl: p.logoUrl,
    sprintsEnabled: p.sprintsEnabled !== false,
    counts: { notes: p._count.meetingNotes, assets: p._count.assets, members: p.members.length },
  };
}

/** The brief from the list when it is loaded, else from the record (the same cache the screen fills). */
export function useProjectBrief(id: string): ProjectBrief | undefined {
  const qc = useQueryClient();
  const fromList = qc.getQueryData<ProjectRow[]>(PROJECTS_KEY)?.find((p) => p.id === id);
  const record = useQuery({
    queryKey: projectKey(id),
    queryFn: () => getProject(id),
    enabled: id !== "" && !fromList,
    select: brief,
  });
  return record.data ?? (fromList ? brief(fromList) : undefined);
}
