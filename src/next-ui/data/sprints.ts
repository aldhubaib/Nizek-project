"use client";

import { useQuery } from "@tanstack/react-query";

import { getSprintSnapshots, listSprints, type SprintDTO, type SprintSnapshotTask } from "@/actions/sprint";

/** A project's sprints, and the task snapshots its closed sprints keep. */

export type { SprintDTO, SprintSnapshotTask };

export const projectSprintsKey = (projectId: string) => ["projects", projectId, "sprints"] as const;
export const sprintSnapshotsKey = (projectId: string) => ["projects", projectId, "sprint-snapshots"] as const;

export function useSprints(projectId: string) {
  return useQuery({
    queryKey: projectSprintsKey(projectId),
    queryFn: () => listSprints(projectId),
    enabled: projectId !== "",
    staleTime: 5_000,
  });
}

/** Only asked for once a closed sprint is on screen; its rows are what the sprint looked like when it ended. */
export function useSprintSnapshots(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: sprintSnapshotsKey(projectId),
    queryFn: () => getSprintSnapshots(projectId),
    enabled: enabled && projectId !== "",
    staleTime: 60_000,
  });
}
