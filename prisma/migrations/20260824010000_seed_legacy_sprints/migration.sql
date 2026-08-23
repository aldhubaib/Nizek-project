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

-- 2d: Auto-assign unassigned active-sprint tasks to a Developer-role member.
-- Picks the first project member whose ProjectRole name is 'Developer' (case-
-- insensitive). Tasks that already have an assignee are left untouched.
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

-- 2e: Backfill assignee info on snapshots after the auto-assign above.
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

-- 2f: Create a sprint planning note for each seeded active sprint.
-- The content embeds the sprint ID in a data-info JSON attribute so the UI
-- can link the note to the sprint. Dates are pre-filled (Aug 24 – Aug 31,
-- 6 working days for Kuwait/GCC Fri-Sat weekend).
INSERT INTO "MeetingNote" (id, title, content, date, "noteType", "projectId", "authorId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'Sprint 1 planning',
  '<div data-type="sprint-info" data-info="'
    || replace(
         '{"sprintId":"' || s.id || '","sprintName":"Sprint 1","status":"ACTIVE",'
         || '"documentDate":"24 Aug 2026","documentDateIso":"2026-08-24",'
         || '"startDate":"24 Aug 2026","endDate":"31 Aug 2026",'
         || '"startIso":"2026-08-24","endIso":"2026-08-31",'
         || '"workingDays":6,"locked":false,"variant":"planning"}',
         '"', '&quot;')
    || '"></div>'
    || '<h2>Introduction</h2>'
    || '<p>This sprint outlines the development work planned for the upcoming iteration. '
    || 'It serves as a shared commitment between all stakeholders, ensuring the team is '
    || 'aligned on the agreed objectives, priorities, and expected deliverables for the sprint.</p>'
    || '<h2>List of Sprint Items</h2>'
    || '<p>Below is the list of development items that have been reviewed, prioritized, and '
    || 'agreed upon by the team for this sprint. These items represent the scope of work to be '
    || 'completed during the sprint and will be tracked throughout the development cycle.</p>',
  '2026-08-24',
  'SPRINT_PLANNING',
  s."projectId",
  (SELECT pm."userId" FROM "ProjectMember" pm WHERE pm."projectId" = s."projectId" ORDER BY pm."createdAt" ASC LIMIT 1),
  NOW(),
  NOW()
FROM "Sprint" s
WHERE s.name = 'Sprint 1'
  AND s.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "MeetingNote" mn
    WHERE mn."projectId" = s."projectId"
      AND mn."noteType" = 'SPRINT_PLANNING'
      AND mn.content LIKE '%' || s.id || '%'
  );
