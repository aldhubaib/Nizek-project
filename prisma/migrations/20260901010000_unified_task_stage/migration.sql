-- Task.stage becomes one status covering the whole life of a task, instead of
-- covering only the part that happens inside a sprint.
--
-- Added:   PLANNED, NEXT, COMPLETED, SHIPPED
-- Removed: CLARIFICATION, CLIENT_REVIEW, READY_FOR_RELEASE
--
-- The four new values are projections of Sprint.status. The board used to hide
-- that by remapping stages at render time, which meant a task in the Next sprint
-- still stored and reported "Backlog". Now the stored value is the answer.

-- ─── 0. Lift the one-open-row-per-task index ──────────────────────────────
--
-- Collapsing history below rewrites and deletes rows in separate statements, so
-- a task briefly has two open rows between them. The index is a real invariant,
-- not a formality, so it is put back at the end rather than weakened.

DROP INDEX IF EXISTS "StageLog_one_open_per_task";

-- ─── 1. Map the removed values ────────────────────────────────────────────
--
-- Done as text while the old type is still in place, so each table can make its
-- own decision before the type is narrowed.

-- Task and StageLog: Clarification was already folded into Backlog by the board,
-- and both Client Review and Ready for Release sat after Internal Review on the
-- way out, so Done is where those tasks effectively were.
ALTER TABLE "Task" ALTER COLUMN "stage" TYPE TEXT USING "stage"::TEXT;
ALTER TABLE "StageLog" ALTER COLUMN "stage" TYPE TEXT USING "stage"::TEXT;
ALTER TABLE "StageLog" ALTER COLUMN "fromStage" TYPE TEXT USING "fromStage"::TEXT;
ALTER TABLE "SprintTaskSnapshot" ALTER COLUMN "stage" TYPE TEXT USING "stage"::TEXT;

UPDATE "Task" SET "stage" = CASE "stage"
  WHEN 'CLARIFICATION'     THEN 'BACKLOG'
  WHEN 'CLIENT_REVIEW'     THEN 'DONE'
  WHEN 'READY_FOR_RELEASE' THEN 'DONE'
  ELSE "stage" END;

UPDATE "StageLog" SET
  "stage" = CASE "stage"
    WHEN 'CLARIFICATION'     THEN 'BACKLOG'
    WHEN 'CLIENT_REVIEW'     THEN 'DONE'
    WHEN 'READY_FOR_RELEASE' THEN 'DONE'
    ELSE "stage" END,
  "fromStage" = CASE "fromStage"
    WHEN 'CLARIFICATION'     THEN 'BACKLOG'
    WHEN 'CLIENT_REVIEW'     THEN 'DONE'
    WHEN 'READY_FOR_RELEASE' THEN 'DONE'
    ELSE "fromStage" END;

-- Snapshots are the frozen record a closed sprint's review reads from, and that
-- review calls anything that is not DONE unfinished. Mapping these two to DONE
-- would retroactively mark tasks as delivered that the review recorded as
-- incomplete, with a reason attached. Internal Review keeps them unfinished.
UPDATE "SprintTaskSnapshot" SET "stage" = CASE "stage"
  WHEN 'CLARIFICATION'     THEN 'BACKLOG'
  WHEN 'CLIENT_REVIEW'     THEN 'INTERNAL_REVIEW'
  WHEN 'READY_FOR_RELEASE' THEN 'INTERNAL_REVIEW'
  ELSE "stage" END;

-- ─── 2. Recreate the type ─────────────────────────────────────────────────

DROP TYPE IF EXISTS "Stage";

CREATE TYPE "Stage" AS ENUM (
  'BACKLOG',
  'PLANNED',
  'NEXT',
  'TODO',
  'IN_DEVELOPMENT',
  'INTERNAL_REVIEW',
  'DONE',
  'COMPLETED',
  'SHIPPED'
);

ALTER TABLE "Task" ALTER COLUMN "stage" TYPE "Stage" USING "stage"::"Stage";
ALTER TABLE "StageLog" ALTER COLUMN "stage" TYPE "Stage" USING "stage"::"Stage";
ALTER TABLE "StageLog" ALTER COLUMN "fromStage" TYPE "Stage" USING "fromStage"::"Stage";
ALTER TABLE "SprintTaskSnapshot" ALTER COLUMN "stage" TYPE "Stage" USING "stage"::"Stage";

-- ─── 3. Collapse adjacent same-stage runs in the history ──────────────────
--
-- Merging three values into DONE turns a task that went Client Review ->
-- Ready for Release -> Done into three consecutive DONE rows. Left alone, the
-- audit module would read that as three separate short visits instead of one
-- long one, and understate how long the task actually sat there.

WITH ordered AS (
  SELECT
    "id",
    "taskId",
    "stage",
    "exitedAt",
    ROW_NUMBER() OVER (PARTITION BY "taskId" ORDER BY "enteredAt", "id") AS rn,
    LAG("stage") OVER (PARTITION BY "taskId" ORDER BY "enteredAt", "id") AS prev_stage
  FROM "StageLog"
),
marked AS (
  SELECT
    *,
    SUM(CASE WHEN prev_stage IS DISTINCT FROM "stage" THEN 1 ELSE 0 END)
      OVER (PARTITION BY "taskId" ORDER BY rn ROWS UNBOUNDED PRECEDING) AS run_id
  FROM ordered
),
runs AS (
  SELECT
    (ARRAY_AGG("id" ORDER BY rn))[1]                  AS keep_id,
    (ARRAY_AGG("exitedAt" ORDER BY rn DESC))[1]       AS run_exited_at,
    COUNT(*)                                          AS run_length
  FROM marked
  GROUP BY "taskId", run_id
)
UPDATE "StageLog" sl
SET "exitedAt" = r.run_exited_at
FROM runs r
WHERE sl."id" = r.keep_id
  AND r.run_length > 1;

-- The rows folded into the kept one. The first row of each run survives, so the
-- run keeps the actor and reason that started it.
WITH ordered AS (
  SELECT
    "id",
    "taskId",
    "stage",
    ROW_NUMBER() OVER (PARTITION BY "taskId" ORDER BY "enteredAt", "id") AS rn,
    LAG("stage") OVER (PARTITION BY "taskId" ORDER BY "enteredAt", "id") AS prev_stage
  FROM "StageLog"
),
marked AS (
  SELECT
    *,
    SUM(CASE WHEN prev_stage IS DISTINCT FROM "stage" THEN 1 ELSE 0 END)
      OVER (PARTITION BY "taskId" ORDER BY rn ROWS UNBOUNDED PRECEDING) AS run_id
  FROM ordered
),
droppable AS (
  SELECT "id"
  FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "taskId", run_id ORDER BY rn) AS pos
    FROM marked
  ) ranked
  WHERE pos > 1
)
DELETE FROM "StageLog" WHERE "id" IN (SELECT "id" FROM droppable);

-- fromStage on a kept row may now point at a stage that was merged away from the
-- row before it. Recompute from what actually precedes each row.
UPDATE "StageLog" sl
SET "fromStage" = prev.prev_stage
FROM (
  SELECT
    "id",
    LAG("stage") OVER (PARTITION BY "taskId" ORDER BY "enteredAt", "id") AS prev_stage
  FROM "StageLog"
) prev
WHERE sl."id" = prev."id"
  AND sl."fromStage" IS DISTINCT FROM prev.prev_stage;

-- ─── 4. Reconcile every task against its sprint ───────────────────────────
--
-- Until now a task's stage and its sprint's status could disagree freely: a task
-- in a Planned sprint stored BACKLOG, and one pulled out of an active sprint
-- kept IN_DEVELOPMENT with no sprint at all. Both are now contradictions.

DROP TABLE IF EXISTS stage_reconcile;

CREATE TEMP TABLE stage_reconcile AS
SELECT
  t."id"          AS task_id,
  t."stage"       AS old_stage,
  t."sprintId"    AS sprint_id,
  t."assigneeId"  AS assignee_id,
  s."name"        AS sprint_name,
  (CASE
    -- Work that finished outside a sprint stays finished. The board keeps
    -- sprintless DONE tasks out of the backlog on purpose, so sending them
    -- there would bury hundreds of completed tasks in a list the UI was
    -- written to exclude them from. Client Review and Ready for Release have
    -- already folded into DONE above, so this covers those too.
    WHEN t."sprintId" IS NULL AND t."stage" = 'DONE' THEN 'DONE'
    WHEN t."sprintId" IS NULL THEN 'BACKLOG'
    WHEN s."status" = 'PLANNED' THEN 'PLANNED'
    WHEN s."status" = 'NEXT' THEN 'NEXT'
    WHEN s."status" = 'SHIPPED' THEN 'SHIPPED'
    WHEN s."status" IN ('COMPLETED', 'PARTIALLY_COMPLETED') THEN 'COMPLETED'
    -- Active: the work stages are the truth, but a task that never left the
    -- pre-sprint stages has to start somewhere, and that is Todo.
    WHEN t."stage" IN ('TODO', 'IN_DEVELOPMENT', 'INTERNAL_REVIEW', 'DONE') THEN t."stage"::TEXT
    ELSE 'TODO'
  END)::"Stage" AS new_stage
FROM "Task" t
LEFT JOIN "Sprint" s ON s."id" = t."sprintId";

DELETE FROM stage_reconcile WHERE old_stage = new_stage;

UPDATE "Task" t
SET "stage" = r.new_stage
FROM stage_reconcile r
WHERE t."id" = r.task_id;

-- Reconciliation is a real change to where a task sits, so it gets recorded
-- rather than applied silently. MIGRATION marks it as our doing, not a person's.
UPDATE "StageLog" sl
SET "exitedAt" = NOW()
FROM stage_reconcile r
WHERE sl."taskId" = r.task_id AND sl."exitedAt" IS NULL;

INSERT INTO "StageLog" ("id", "taskId", "stage", "fromStage", "enteredAt", "source", "reason", "sprintId", "sprintName", "assigneeId")
SELECT
  'sl_recon_' || gen_random_uuid()::TEXT,
  r.task_id,
  r.new_stage,
  r.old_stage,
  NOW(),
  'MIGRATION',
  'Aligned with the sprint it is in',
  r.sprint_id,
  r.sprint_name,
  r.assignee_id
FROM stage_reconcile r;

DROP TABLE stage_reconcile;

-- ─── 5. Renumber board order ──────────────────────────────────────────────
--
-- Merged stages collided: two tasks that were order 0 in Client Review and
-- order 0 in Ready for Release are now both order 0 in Done, and the board
-- would order them arbitrarily.

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "projectId", "stage" ORDER BY "order", "createdAt", "id") - 1 AS position
  FROM "Task"
  WHERE "archivedAt" IS NULL
)
UPDATE "Task" t
SET "order" = ranked.position
FROM ranked
WHERE t."id" = ranked."id"
  AND t."order" <> ranked.position;

-- ─── 6. Stage ids stored as plain text ────────────────────────────────────
--
-- The type change does not reach these, and Postgres raises no error, so left
-- behind they would silently stop matching any stage — quietly revoking
-- people's ability to move tasks.

-- JSON array, e.g. ["BACKLOG","IN_DEVELOPMENT"]
UPDATE "ProjectRole"
SET "allowedStages" = REPLACE(REPLACE(REPLACE(
      "allowedStages",
      'READY_FOR_RELEASE', 'DONE'),
      'CLIENT_REVIEW', 'DONE'),
      'CLARIFICATION', 'BACKLOG')
WHERE "allowedStages" IS NOT NULL;

-- JSON object keyed by stage id, with stage ids in the values too.
UPDATE "ProjectRole"
SET "allowedTransitions" = REPLACE(REPLACE(REPLACE(
      "allowedTransitions",
      'READY_FOR_RELEASE', 'DONE'),
      'CLIENT_REVIEW', 'DONE'),
      'CLARIFICATION', 'BACKLOG')
WHERE "allowedTransitions" IS NOT NULL;

-- Frozen copy of the stage an audited task sat in. stageLabel beside it holds
-- the human label and is left alone.
UPDATE "TaskAuditItem"
SET "stage" = CASE "stage"
  WHEN 'CLARIFICATION'     THEN 'BACKLOG'
  WHEN 'CLIENT_REVIEW'     THEN 'DONE'
  WHEN 'READY_FOR_RELEASE' THEN 'DONE'
  ELSE "stage" END
WHERE "stage" IN ('CLARIFICATION', 'CLIENT_REVIEW', 'READY_FOR_RELEASE');

-- TaskActivity stores stage ids as free text in oldValue / newValue, and the
-- activity feed and the decline lookup both compare them against real stages.
UPDATE "TaskActivity"
SET
  "oldValue" = CASE "oldValue"
    WHEN 'CLARIFICATION'     THEN 'BACKLOG'
    WHEN 'CLIENT_REVIEW'     THEN 'DONE'
    WHEN 'READY_FOR_RELEASE' THEN 'DONE'
    ELSE "oldValue" END,
  "newValue" = CASE "newValue"
    WHEN 'CLARIFICATION'     THEN 'BACKLOG'
    WHEN 'CLIENT_REVIEW'     THEN 'DONE'
    WHEN 'READY_FOR_RELEASE' THEN 'DONE'
    ELSE "newValue" END
WHERE "field" = 'stage'
  AND ("oldValue" IN ('CLARIFICATION', 'CLIENT_REVIEW', 'READY_FOR_RELEASE')
    OR "newValue" IN ('CLARIFICATION', 'CLIENT_REVIEW', 'READY_FOR_RELEASE'));

-- ─── 7. Restore the invariant ─────────────────────────────────────────────

CREATE UNIQUE INDEX "StageLog_one_open_per_task"
  ON "StageLog"("taskId") WHERE "exitedAt" IS NULL;
