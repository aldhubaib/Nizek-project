"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addMemberToProject, cancelInvitation, getAvailableUsers, inviteMember, removeMember, updateMemberRole } from "@/actions/project";

import { PROJECTS_KEY, projectInvitationsKey, projectKey, projectRolesKey } from "./projects";

/**
 * A project's people, changed through the same actions the live panel calls: adding someone who
 * already has an account, inviting by email, giving a member another role, removing a member,
 * cancelling an invitation. The server checks the rights again on every call.
 */

export type AvailableUser = Awaited<ReturnType<typeof getAvailableUsers>>[number];

export const availableUsersKey = (projectId: string) => ["projects", projectId, "available-users"] as const;

/** Everyone with an account who is not on the project yet, plus people with a pending team invite. */
export function useAvailableUsers(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: availableUsersKey(projectId),
    queryFn: () => getAvailableUsers(projectId),
    enabled: enabled && projectId !== "",
    staleTime: 30_000,
  });
}

/**
 * After any change to the people: the record (members), the list (counts), the invitations,
 * the roles (their counts), who is left to add. Returned from `onSettled`, so a dialog's
 * "Saving…" lasts until the page behind it shows the change.
 */
function useTeamRefresh(projectId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true }),
      qc.invalidateQueries({ queryKey: PROJECTS_KEY, exact: true }),
      qc.invalidateQueries({ queryKey: projectInvitationsKey(projectId) }),
      qc.invalidateQueries({ queryKey: projectRolesKey(projectId) }),
      qc.invalidateQueries({ queryKey: availableUsersKey(projectId) }),
    ]).then(() => undefined);
}

/** Adds each chosen person with the one role; the ones that fail are named together at the end, the rest are added. */
export function useAddMembers(projectId: string) {
  const refresh = useTeamRefresh(projectId);
  return useMutation({
    mutationFn: async ({ users, roleId }: { users: Pick<AvailableUser, "id" | "name" | "email">[]; roleId: string }) => {
      const failed: string[] = [];
      for (const u of users) {
        try {
          await addMemberToProject({ projectId, userId: u.id, roleId });
        } catch (err) {
          failed.push(`${u.name || u.email}: ${err instanceof Error ? err.message : "could not be added"}`);
        }
      }
      if (failed.length > 0) throw new Error(failed.join("\n"));
    },
    onSettled: refresh,
  });
}

export function useInviteMember(projectId: string) {
  const refresh = useTeamRefresh(projectId);
  return useMutation({
    mutationFn: (data: { email: string; name: string; roleId: string; gender: "MALE" | "FEMALE" | null }) =>
      inviteMember({ projectId, ...data }),
    onSettled: refresh,
  });
}

export function useUpdateMemberRole(projectId: string) {
  const refresh = useTeamRefresh(projectId);
  return useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) => updateMemberRole({ projectId, memberId, roleId }),
    onSettled: refresh,
  });
}

/** Removing someone who still owns open tasks is refused until the tasks are handed to another member. */
export class TransferRequiredError extends Error {
  constructor(public readonly taskCount: number) {
    super(`This person still has ${taskCount} open ${taskCount === 1 ? "task" : "tasks"}.`);
    this.name = "TransferRequiredError";
  }
}

export function useRemoveMember(projectId: string) {
  const refresh = useTeamRefresh(projectId);
  return useMutation({
    mutationFn: async ({ memberId, transferToUserId }: { memberId: string; transferToUserId?: string }) => {
      const result = await removeMember({ projectId, memberId, transferToUserId });
      if (result.success) return;
      const transfer = /^TRANSFER_REQUIRED:(\d+)$/.exec(result.error);
      if (transfer) throw new TransferRequiredError(Number(transfer[1]));
      throw new Error(result.error);
    },
    onSettled: refresh,
  });
}

export function useCancelInvitation(projectId: string) {
  const refresh = useTeamRefresh(projectId);
  return useMutation({
    mutationFn: (invitationId: string) => cancelInvitation({ projectId, invitationId }),
    onSettled: refresh,
  });
}
