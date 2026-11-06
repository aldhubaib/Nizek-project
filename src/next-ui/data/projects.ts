"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getProject,
  getProjectInvitations,
  getProjects,
  setProjectClientChat,
  setProjectSprints,
  setProofUploaders,
  setProofVideoMode,
  updateProject,
} from "@/actions/project";
import { createRole, deleteRole, getRoles, updateRole } from "@/actions/role";
import { getTeams } from "@/actions/team";
import { proofVideoModeOf as modeOf, type ProofVideoMode } from "@/lib/proof-video-mode";
import { uploadFileToR2 } from "@/lib/upload";

/**
 * Projects, as the new UI reads them: the existing server actions behind react-query. The list
 * and a record share one cache, so a project opened beside the list paints at once, and the
 * breadcrumb takes its label from the same data the screen uses (no request of its own).
 * The changes a project's settings make go through the same actions the live panel calls.
 */

export type ProjectRow = Awaited<ReturnType<typeof getProjects>>[number];
export type ProjectDetail = Awaited<ReturnType<typeof getProject>>;
export type ProjectInvitation = Awaited<ReturnType<typeof getProjectInvitations>>[number];
export type ProjectRole = Awaited<ReturnType<typeof getRoles>>[number];
export type TeamRow = Awaited<ReturnType<typeof getTeams>>[number];

export const PROJECTS_KEY = ["projects"] as const;
export const TEAMS_KEY = ["teams"] as const;
export const projectKey = (id: string) => ["projects", id] as const;
export const projectInvitationsKey = (id: string) => ["projects", id, "invitations"] as const;
export const projectRolesKey = (id: string) => ["projects", id, "roles"] as const;

/**
 * The project's record and the list are read again (those two only, not every query under
 * them). Returned from a mutation's `onSettled`, so the mutation counts as pending until the
 * fresh data is in and a form never shows the old values for a moment after "Save".
 */
export function useProjectRefresh(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: PROJECTS_KEY, exact: true }),
    ]).then(() => undefined);
}

/** Every team, for the Settings page's team choice. */
export function useTeams(enabled = true) {
  return useQuery({ queryKey: TEAMS_KEY, queryFn: () => getTeams(), enabled, staleTime: 60_000 });
}

/** Name, description, team or logo address; the server allows admins and project managers. */
export function useUpdateProject(projectId: string) {
  const refresh = useProjectRefresh(projectId);
  return useMutation({
    mutationFn: (data: { name?: string; description?: string; logoUrl?: string | null; teamId?: string | null }) =>
      updateProject({ projectId, ...data }),
    onSettled: refresh,
  });
}

/** The largest logo accepted, as on the live panel. */
export const LOGO_MAX_BYTES = 512 * 1024;

/** A new logo: the image goes to storage from the browser, then the project points at it. */
export function useUploadProjectLogo(projectId: string) {
  const refresh = useProjectRefresh(projectId);
  return useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith("image/")) throw new Error("The logo must be an image.");
      if (file.size > LOGO_MAX_BYTES) throw new Error("The logo must be under 512 KB.");
      const { url } = await uploadFileToR2(file);
      await updateProject({ projectId, logoUrl: url });
      return url;
    },
    onSettled: refresh,
  });
}

export function useSetProjectSprints(projectId: string) {
  const refresh = useProjectRefresh(projectId);
  return useMutation({ mutationFn: (enabled: boolean) => setProjectSprints({ projectId, enabled }), onSettled: refresh });
}

export function useSetProjectClientChat(projectId: string) {
  const refresh = useProjectRefresh(projectId);
  return useMutation({ mutationFn: (enabled: boolean) => setProjectClientChat({ projectId, enabled }), onSettled: refresh });
}

/** The project's "Video bypass" rule — who uploads the proof video, or none per task. */
export function useSetProofVideoMode(projectId: string) {
  const refresh = useProjectRefresh(projectId);
  return useMutation({ mutationFn: (mode: ProofVideoMode) => setProofVideoMode({ projectId, mode }), onSettled: refresh });
}

/** The members who upload proof videos on behalf of others (the "Assign" mode). Replaces the set. */
export function useSetProofUploaders(projectId: string) {
  const refresh = useProjectRefresh(projectId);
  return useMutation({ mutationFn: (memberIds: string[]) => setProofUploaders({ projectId, memberIds }), onSettled: refresh });
}

/** The project's stored video rule, or the default for a record that predates the setting. */
export function proofVideoModeOf(p: { proofVideoMode?: string | null } | undefined): ProofVideoMode {
  return modeOf(p?.proofVideoMode);
}

/** The project's pending invitations (Team view). */
export function useProjectInvitations(projectId: string) {
  return useQuery({
    queryKey: projectInvitationsKey(projectId),
    queryFn: () => getProjectInvitations(projectId),
    enabled: projectId !== "",
    staleTime: 30_000,
  });
}

/** The project's own roles, with how many members hold each (Settings view). */
export function useProjectRoles(projectId: string) {
  return useQuery({
    queryKey: projectRolesKey(projectId),
    queryFn: () => getRoles(projectId),
    enabled: projectId !== "",
    staleTime: 30_000,
  });
}

export type NewRoleInput = Omit<Parameters<typeof createRole>[0], "projectId">;
export type RoleChanges = Omit<Parameters<typeof updateRole>[0], "roleId">;

/** The roles and the record (its members carry their role) are read again after a role changes. */
function useRolesRefresh(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: projectRolesKey(projectId) }), qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true })]).then(
      () => undefined,
    );
}

export function useCreateRole(projectId: string) {
  const refresh = useRolesRefresh(projectId);
  return useMutation({ mutationFn: (input: NewRoleInput) => createRole({ projectId, ...input }), onSettled: refresh });
}

export function useUpdateRole(projectId: string) {
  const refresh = useRolesRefresh(projectId);
  return useMutation({ mutationFn: ({ roleId, ...changes }: RoleChanges & { roleId: string }) => updateRole({ roleId, ...changes }), onSettled: refresh });
}

/** The server answers `{ error }` when the role is Admin or still held by someone; that becomes the thrown error. */
export function useDeleteRole(projectId: string) {
  const refresh = useRolesRefresh(projectId);
  return useMutation({
    mutationFn: async (roleId: string) => {
      const r = await deleteRole(roleId);
      if (r.error) throw new Error(r.error);
    },
    onSettled: refresh,
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

/** What the sidebar's project menu needs of a project: its name and logo, whether it runs sprints and a Kanban, a few counts. */
export interface ProjectBrief {
  name: string;
  logoUrl: string | null;
  sprintsEnabled: boolean;
  /** A board exists and is switched on. */
  kanbanEnabled: boolean;
  counts: { notes: number; assets: number; members: number };
}

/** Whether the project's Kanban (its board) is on: a board that was added and not hidden. */
export function kanbanOn(p: { board?: { enabled: boolean } | null }): boolean {
  return p.board?.enabled === true;
}

function brief(p: ProjectRow | ProjectDetail): ProjectBrief {
  return {
    name: p.name,
    logoUrl: p.logoUrl,
    sprintsEnabled: p.sprintsEnabled !== false,
    kanbanEnabled: kanbanOn(p),
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
