-- StageLog becomes the accountability record for a task's lifecycle.
--
-- Before this, a row said only "this task was in this stage between these two
-- timestamps". Who moved it lived in TaskActivity, and the only thing joining
-- the two tables was a timestamp. This adds the missing columns so one row
-- answers who / from where / why / under which sprint / who held it, then
-- backfills as much of that as the existing data can honestly support.

CREATE TYPE "StageSource" AS ENUM (
  'TASK_CREATED',
  'USER_MOVE',
  'DECLINE',
  'SPRINT_SCHEDULE',
  'SPRINT_UNSCHEDULE',
  'SPRINT_START',
  'SPRINT_COMPLETE',
  'SPRINT_STATUS',
  'MIGRATION'
);

-- source is NOT NULL with no default in the schema, so that application code is
-- forced to state why every transition happened. The default here exists only
-- to give existing rows a value, and is dropped immediately afterwards.
ALTER TABLE "StageLog"
  ADD COLUMN "fromStage"  "Stage",
  ADD COLUMN "actorId"    TEXT,
  ADD COLUMN "source"     "StageSource" NOT NULL DEFAULT 'MIGRATION',
  ADD COLUMN "reason"     TEXT,
  ADD COLUMN "sprintId"   TEXT,
  ADD COLUMN "sprintName" TEXT,
  ADD COLUMN "assigneeId" TEXT;

ALTER TABLE "StageLog"
  ADD CONSTRAINT "StageLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Repair open rows before anything relies on there being one ───────────
--
-- moveTask only ever closed rows whose stage matched the stage it thought the
-- task was leaving, so any drift between Task.stage and StageLog left a second
-- row open. Keep the most recent open row per task and close the rest, or the
-- unique index at the bottom cannot be created.

UPDATE "StageLog" sl
SET "exitedAt" = newer."enteredAt"
FROM (
  SELECT
    "id",
    "taskId",
    "enteredAt",
    LEAD("enteredAt") OVER (PARTITION BY "taskId" ORDER BY "enteredAt", "id") AS next_entered
  FROM "StageLog"
  WHERE "exitedAt" IS NULL
) newer
WHERE sl."id" = newer."id"
  AND newer.next_entered IS NOT NULL;

-- A task with no log at all has no history to show. Synthesize its opening row
-- from the task's own creation, marked MIGRATION so it is never mistaken for a
-- recorded event.
INSERT INTO "StageLog" ("id", "taskId", "stage", "enteredAt", "source", "actorId", "assigneeId", "sprintId")
SELECT
  'sl_seed_' || t."id",
  t."id",
  t."stage",
  t."createdAt",
  'MIGRATION',
  t."createdById",
  t."assigneeId",
  t."sprintId"
FROM "Task" t
WHERE NOT EXISTS (SELECT 1 FROM "StageLog" sl WHERE sl."taskId" = t."id");

-- A task whose log exists but has been fully closed has no current stage on
-- record. Reopen from the last known exit.
INSERT INTO "StageLog" ("id", "taskId", "stage", "enteredAt", "fromStage", "source", "assigneeId", "sprintId")
SELECT
  'sl_reopen_' || t."id",
  t."id",
  t."stage",
  last_log."exitedAt",
  last_log."stage",
  'MIGRATION',
  t."assigneeId",
  t."sprintId"
FROM "Task" t
JOIN LATERAL (
  SELECT sl."stage", sl."exitedAt"
  FROM "StageLog" sl
  WHERE sl."taskId" = t."id"
  ORDER BY sl."enteredAt" DESC, sl."id" DESC
  LIMIT 1
) last_log ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM "StageLog" sl WHERE sl."taskId" = t."id" AND sl."exitedAt" IS NULL
);

-- ─── Backfill the new columns ─────────────────────────────────────────────

-- Where the task came from is derivable from the row before it.
UPDATE "StageLog" sl
SET "fromStage" = prev.prev_stage
FROM (
  SELECT
    "id",
    LAG("stage") OVER (PARTITION BY "taskId" ORDER BY "enteredAt", "id") AS prev_stage
  FROM "StageLog"
) prev
WHERE sl."id" = prev."id"
  AND sl."fromStage" IS NULL
  AND prev.prev_stage IS NOT NULL;

-- The first row of every task is its creation, and the creator is known.
UPDATE "StageLog" sl
SET "source" = 'TASK_CREATED', "actorId" = COALESCE(sl."actorId", t."createdById")
FROM "Task" t
WHERE sl."taskId" = t."id"
  AND sl."fromStage" IS NULL
  AND sl."enteredAt" <= t."createdAt" + INTERVAL '5 seconds';

-- Everything else that was genuinely user-driven can be recovered from
-- TaskActivity, which is the only place the actor was ever stored. Match on the
-- stage entered plus a small time window, since the two writes were adjacent.
WITH matched AS (
  SELECT DISTINCT ON (sl."id")
    sl."id"      AS log_id,
    ta."userId"  AS actor_id,
    ta."action"  AS action
  FROM "StageLog" sl
  JOIN "TaskActivity" ta
    ON ta."taskId" = sl."taskId"
   AND ta."field" = 'stage'
   AND ta."action" IN ('moved', 'declined')
   AND ta."newValue" = sl."stage"::TEXT
   AND ta."createdAt" BETWEEN sl."enteredAt" - INTERVAL '10 seconds'
                          AND sl."enteredAt" + INTERVAL '10 seconds'
  WHERE sl."source" = 'MIGRATION'
  ORDER BY sl."id", ABS(EXTRACT(EPOCH FROM (ta."createdAt" - sl."enteredAt")))
)
UPDATE "StageLog" sl
SET
  "actorId" = m.actor_id,
  "source"  = CASE m.action WHEN 'declined' THEN 'DECLINE'::"StageSource" ELSE 'USER_MOVE'::"StageSource" END
FROM matched m
WHERE sl."id" = m.log_id;

-- Sprint context and ownership: only the currently open row can be attributed
-- with confidence, because Task holds just its present sprint and assignee.
-- Closed rows keep NULL rather than being stamped with a sprint they may never
-- have been in.
UPDATE "StageLog" sl
SET
  "sprintId"   = COALESCE(sl."sprintId", t."sprintId"),
  "assigneeId" = COALESCE(sl."assigneeId", t."assigneeId")
FROM "Task" t
WHERE sl."taskId" = t."id"
  AND sl."exitedAt" IS NULL;

UPDATE "StageLog" sl
SET "sprintName" = s."name"
FROM "Sprint" s
WHERE sl."sprintId" = s."id"
  AND sl."sprintName" IS NULL;

ALTER TABLE "StageLog" ALTER COLUMN "source" DROP DEFAULT;

-- ─── Constraints and indexes ──────────────────────────────────────────────

-- One open row per task, enforced by Postgres rather than by convention, so a
-- future write path cannot silently leave two stages open at once.
CREATE UNIQUE INDEX "StageLog_one_open_per_task"
  ON "StageLog"("taskId") WHERE "exitedAt" IS NULL;

CREATE INDEX "StageLog_taskId_enteredAt_idx" ON "StageLog"("taskId", "enteredAt");
CREATE INDEX "StageLog_actorId_enteredAt_idx" ON "StageLog"("actorId", "enteredAt");
