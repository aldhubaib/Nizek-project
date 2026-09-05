-- Mark the snapshots that record a task leaving a sprint already under way.
--
-- Without this, the sprint document reported three different things as scope
-- removed: work genuinely dragged out mid-sprint, work shuffled between sprints
-- during planning, and work the sprint simply did not finish. All three end up
-- as a snapshot whose task now sits somewhere else.
ALTER TABLE "SprintTaskSnapshot"
  ADD COLUMN "departedAfterStart" BOOLEAN NOT NULL DEFAULT false;

-- Backfill only where the answer is certain: a running sprint has no closing
-- snapshots yet, so every row on one is a departure, and the generated reasons
-- below are the ones written when a task moved before the sprint had started.
UPDATE "SprintTaskSnapshot" AS s
SET "departedAfterStart" = true
FROM "Sprint" AS sp, "Task" AS t
WHERE s."sprintId" = sp.id
  AND s."taskId" = t.id
  AND sp.status = 'ACTIVE'
  AND (t."sprintId" IS DISTINCT FROM s."sprintId")
  AND s."incompleteReason" IS NOT NULL
  AND s."incompleteReason" <> 'Removed from the sprint'
  AND s."incompleteReason" NOT LIKE 'Moved to %';
