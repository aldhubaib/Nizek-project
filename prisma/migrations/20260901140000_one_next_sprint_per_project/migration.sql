-- Only one sprint may sit in Next per project.
--
-- This was enforced in application code by a read followed by a write, with no
-- transaction around the pair, so two people dragging tasks into Next at the
-- same moment each created their own sprint there. The board renders
-- `sprints.find(s => s.status === "NEXT")`, so one of those sprints — and its
-- tasks, and its planning document — became invisible.
--
-- ACTIVE has had this index since the sprints migration; NEXT never got one.

-- Repair first: keep the sprint the board would have been showing (lowest
-- sortOrder, oldest as a tiebreak) and send the rest back to Planned. Their
-- tasks follow, since Task.stage mirrors the sprint's status.
WITH ranked AS (
    SELECT id, row_number() OVER (
        PARTITION BY "projectId" ORDER BY "sortOrder", "createdAt"
    ) AS rn
    FROM "Sprint"
    WHERE status = 'NEXT'
)
UPDATE "Sprint" SET status = 'PLANNED'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE "Task" t
SET stage = 'PLANNED'
FROM "Sprint" s
WHERE t."sprintId" = s.id
  AND s.status = 'PLANNED'
  AND t.stage = 'NEXT'
  AND t."archivedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_one_next_per_project" ON "Sprint"("projectId") WHERE "status" = 'NEXT';
