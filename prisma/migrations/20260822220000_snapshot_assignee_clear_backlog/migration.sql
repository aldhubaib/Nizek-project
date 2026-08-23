-- Freeze who was assigned when the sprint closed, then clear live assignees
-- on tasks that are no longer in a sprint.
ALTER TABLE "SprintTaskSnapshot" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "SprintTaskSnapshot" ADD COLUMN "assigneeName" TEXT;
ALTER TABLE "SprintTaskSnapshot" ADD COLUMN "assigneeImageUrl" TEXT;

UPDATE "SprintTaskSnapshot" AS s
SET
  "assigneeId" = t."assigneeId",
  "assigneeName" = u.name,
  "assigneeImageUrl" = u."imageUrl"
FROM "Task" AS t
LEFT JOIN "User" AS u ON u.id = t."assigneeId"
WHERE s."taskId" = t.id;

UPDATE "Task"
SET "assigneeId" = NULL
WHERE "sprintId" IS NULL
  AND "archivedAt" IS NULL
  AND "assigneeId" IS NOT NULL;
