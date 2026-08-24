-- Fix: assign unassigned active-sprint tasks to the first Developer-role member.
-- Re-runs the same logic as step 2d in seed_legacy_sprints, catching any tasks
-- that were missed (e.g. tasks whose assigneeId was NULL but the lateral join
-- didn't fire due to timing or baseline).

UPDATE "Task" t
SET "assigneeId" = dev."userId"
FROM "Sprint" s
CROSS JOIN LATERAL (
  SELECT pm."userId"
  FROM "ProjectMember" pm
  JOIN "ProjectRole" pr ON pr.id = pm."roleId"
  WHERE pm."projectId" = s."projectId"
    AND lower(pr.name) = 'developer'
  ORDER BY pm."createdAt" ASC
  LIMIT 1
) dev
WHERE s."projectId" = t."projectId"
  AND s.status = 'ACTIVE'
  AND t."sprintId" = s.id
  AND t."archivedAt" IS NULL
  AND t."assigneeId" IS NULL;

-- Backfill assignee info on snapshots that are still missing it.
UPDATE "SprintTaskSnapshot" ss
SET
  "assigneeId" = t."assigneeId",
  "assigneeName" = u.name,
  "assigneeImageUrl" = u."imageUrl"
FROM "Task" t
LEFT JOIN "User" u ON u.id = t."assigneeId"
WHERE ss."taskId" = t.id
  AND t."assigneeId" IS NOT NULL
  AND ss."assigneeId" IS NULL;
