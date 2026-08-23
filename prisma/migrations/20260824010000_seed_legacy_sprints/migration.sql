-- Seed legacy tasks into sprints so the new sprint board is populated on first deploy.
-- All statements are idempotent: they only insert if no matching sprint exists yet.

-- 1a: Create a completed sprint per project that has DONE tasks.
INSERT INTO "Sprint" (id, name, goal, "startDate", "endDate", status, "completedAt", "projectId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'Pre-Sprint Legacy',
  NULL,
  p."createdAt",
  NOW(),
  'COMPLETED',
  NOW(),
  p.id,
  NOW(),
  NOW()
FROM "Project" p
WHERE EXISTS (
  SELECT 1 FROM "Task" t
  WHERE t."projectId" = p.id AND t.stage = 'DONE' AND t."archivedAt" IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM "Sprint" s
  WHERE s."projectId" = p.id AND s.name = 'Pre-Sprint Legacy'
);

-- 1b: Create snapshots for every DONE task in each legacy sprint.
INSERT INTO "SprintTaskSnapshot" (id, "sprintId", "taskId", stage, "estimatedMinutes", "assigneeId", "assigneeName", "assigneeImageUrl")
SELECT
  gen_random_uuid()::text,
  s.id,
  t.id,
  'DONE',
  t."estimatedMinutes",
  t."assigneeId",
  u.name,
  u."imageUrl"
FROM "Task" t
JOIN "Sprint" s
  ON s."projectId" = t."projectId"
  AND s.name = 'Pre-Sprint Legacy'
  AND s.status = 'COMPLETED'
LEFT JOIN "User" u ON u.id = t."assigneeId"
WHERE t.stage = 'DONE'
  AND t."archivedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SprintTaskSnapshot" x
    WHERE x."sprintId" = s.id AND x."taskId" = t.id
  );

-- 2a: Create an active sprint per project that has pipeline tasks.
INSERT INTO "Sprint" (id, name, goal, "startDate", "endDate", status, "projectId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'Sprint 1',
  NULL,
  '2026-08-24T00:00:00Z',
  '2026-08-31T23:59:59Z',
  'ACTIVE',
  p.id,
  NOW(),
  NOW()
FROM "Project" p
WHERE EXISTS (
  SELECT 1 FROM "Task" t
  WHERE t."projectId" = p.id
    AND t.stage IN ('READY_FOR_DEV','IN_DEVELOPMENT','INTERNAL_REVIEW','CLIENT_REVIEW','READY_FOR_RELEASE')
    AND t."archivedAt" IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM "Sprint" s
  WHERE s."projectId" = p.id AND s.status = 'ACTIVE'
);

-- 2b: Assign pipeline tasks to their project's active sprint.
UPDATE "Task" t
SET "sprintId" = s.id
FROM "Sprint" s
WHERE s."projectId" = t."projectId"
  AND s.name = 'Sprint 1'
  AND s.status = 'ACTIVE'
  AND t.stage IN ('READY_FOR_DEV','IN_DEVELOPMENT','INTERNAL_REVIEW','CLIENT_REVIEW','READY_FOR_RELEASE')
  AND t."archivedAt" IS NULL
  AND t."sprintId" IS NULL;

-- 2c: Create starting snapshots for active sprint tasks.
INSERT INTO "SprintTaskSnapshot" (id, "sprintId", "taskId", stage, "estimatedMinutes", "assigneeId", "assigneeName", "assigneeImageUrl")
SELECT
  gen_random_uuid()::text,
  s.id,
  t.id,
  t.stage,
  t."estimatedMinutes",
  t."assigneeId",
  u.name,
  u."imageUrl"
FROM "Task" t
JOIN "Sprint" s
  ON s."projectId" = t."projectId"
  AND s.name = 'Sprint 1'
  AND s.status = 'ACTIVE'
LEFT JOIN "User" u ON u.id = t."assigneeId"
WHERE t.stage IN ('READY_FOR_DEV','IN_DEVELOPMENT','INTERNAL_REVIEW','CLIENT_REVIEW','READY_FOR_RELEASE')
  AND t."archivedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SprintTaskSnapshot" x
    WHERE x."sprintId" = s.id AND x."taskId" = t.id
  );
