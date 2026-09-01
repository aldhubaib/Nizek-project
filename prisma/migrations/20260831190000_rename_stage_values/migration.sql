-- Rename two Stage values to the labels the UI already shows for them, so the
-- stored value and the words on screen are the same thing:
--   NEW_REQUEST   -> BACKLOG   (label was always "Backlog")
--   READY_FOR_DEV -> TODO      (label was always "Todo")
--
-- The other six values already match their labels and are left alone.
--
-- One Stage type is shared by Task.stage, StageLog.stage and
-- SprintTaskSnapshot.stage, so these two statements cover all three columns.
-- RENAME VALUE is a catalog-only change: no table rewrite, no index rebuild,
-- and enum sort order is preserved.

ALTER TYPE "Stage" RENAME VALUE 'NEW_REQUEST' TO 'BACKLOG';
ALTER TYPE "Stage" RENAME VALUE 'READY_FOR_DEV' TO 'TODO';

-- Stage ids are also held as plain text in three columns, which the rename
-- above does not reach. Postgres raises no error here, so leaving these behind
-- would silently stop stored role permissions from matching any stage, quietly
-- revoking people's ability to create or move tasks.
--
-- REPLACE is safe for both names: neither is a substring of another stage id
-- ('READY_FOR_DEV' is not part of 'READY_FOR_RELEASE'), and neither
-- replacement introduces a string that a later pass would match again.

-- JSON array of stage ids, e.g. ["NEW_REQUEST","IN_DEVELOPMENT"]
UPDATE "ProjectRole"
SET "allowedStages" = REPLACE(REPLACE("allowedStages", 'NEW_REQUEST', 'BACKLOG'), 'READY_FOR_DEV', 'TODO')
WHERE "allowedStages" IS NOT NULL;

-- JSON object keyed by stage id, with stage ids in the values too,
-- e.g. {"NEW_REQUEST":["READY_FOR_DEV"]}
UPDATE "ProjectRole"
SET "allowedTransitions" = REPLACE(REPLACE("allowedTransitions", 'NEW_REQUEST', 'BACKLOG'), 'READY_FOR_DEV', 'TODO')
WHERE "allowedTransitions" IS NOT NULL;

-- Frozen snapshot of the stage an audited task sat in. stageLabel alongside it
-- holds the human label, which has not changed.
UPDATE "TaskAuditItem"
SET "stage" = CASE "stage"
  WHEN 'NEW_REQUEST' THEN 'BACKLOG'
  WHEN 'READY_FOR_DEV' THEN 'TODO'
  ELSE "stage"
END
WHERE "stage" IN ('NEW_REQUEST', 'READY_FOR_DEV');

-- TaskActivity holds stage ids as free text in oldValue / newValue, which the
-- activity feed and the decline lookup both compare against real stages. Left
-- behind, every historical move would render under a stage id that no longer
-- exists.
UPDATE "TaskActivity"
SET
  "oldValue" = CASE "oldValue"
    WHEN 'NEW_REQUEST'   THEN 'BACKLOG'
    WHEN 'READY_FOR_DEV' THEN 'TODO'
    ELSE "oldValue" END,
  "newValue" = CASE "newValue"
    WHEN 'NEW_REQUEST'   THEN 'BACKLOG'
    WHEN 'READY_FOR_DEV' THEN 'TODO'
    ELSE "newValue" END
WHERE "field" = 'stage'
  AND ("oldValue" IN ('NEW_REQUEST', 'READY_FOR_DEV')
    OR "newValue" IN ('NEW_REQUEST', 'READY_FOR_DEV'));
