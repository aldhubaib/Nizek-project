-- Fold Clarification tasks into Backlog (NEW_REQUEST).
-- Place them after existing backlog cards so order stays unique per project.

WITH ranked AS (
  SELECT
    t.id,
    COALESCE(
      (
        SELECT MAX(b."order")
        FROM "Task" b
        WHERE b."projectId" = t."projectId"
          AND b.stage = 'NEW_REQUEST'
          AND b."archivedAt" IS NULL
      ),
      -1
    ) + ROW_NUMBER() OVER (
      PARTITION BY t."projectId"
      ORDER BY t."order" ASC, t."taskNumber" ASC
    ) AS new_order
  FROM "Task" t
  WHERE t.stage = 'CLARIFICATION'
)
UPDATE "Task" t
SET
  stage = 'NEW_REQUEST',
  "order" = ranked.new_order
FROM ranked
WHERE t.id = ranked.id;

UPDATE "StageLog"
SET stage = 'NEW_REQUEST'
WHERE stage = 'CLARIFICATION'
  AND "exitedAt" IS NULL;
