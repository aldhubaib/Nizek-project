/**
 * The query keys the project's data modules share, so a change in one (a sprint ending, a
 * task scheduled) can refresh what another shows without the two importing each other.
 */
export const projectTasksKey = (projectId: string) => ["projects", projectId, "tasks"] as const;
export const projectSprintsKey = (projectId: string) => ["projects", projectId, "sprints"] as const;
export const projectNotesKey = (projectId: string) => ["projects", projectId, "notes"] as const;
