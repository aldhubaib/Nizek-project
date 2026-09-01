-- Decision and Risk move out of the planning document's HTML and into a table.
--
-- They were previously only attributes on a sprint-task node, so the server had
-- no way to check them: starting a sprint trusted whatever the browser said.
-- The backfill below lifts the existing values out of the HTML so nothing that
-- has already been written is lost.

-- CreateTable
CREATE TABLE "SprintTaskPlan" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT '',
    "risk" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintTaskPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintTaskPlan_sprintId_idx" ON "SprintTaskPlan"("sprintId");

-- CreateIndex
CREATE INDEX "SprintTaskPlan_taskId_idx" ON "SprintTaskPlan"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintTaskPlan_sprintId_taskId_key" ON "SprintTaskPlan"("sprintId", "taskId");

-- AddForeignKey
ALTER TABLE "SprintTaskPlan" ADD CONSTRAINT "SprintTaskPlan_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintTaskPlan" ADD CONSTRAINT "SprintTaskPlan_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from planning document HTML.
--
-- Attribute order inside a sprint-task tag is not stable (TipTap re-serializes
-- in its own attribute order), so every value is matched independently rather
-- than positionally. Only tasks still in the sprint are migrated: a row left
-- behind by a task that has since moved on is a ghost, and carrying it over
-- would re-create the drift this whole change exists to remove.
WITH linked AS (
    SELECT
        n.id AS note_id,
        n.content,
        n."createdAt",
        (regexp_match(
            replace(replace((regexp_match(n.content, 'data-info="([^"]*)"'))[1], '&quot;', '"'), '&amp;', '&'),
            '"sprintId"\s*:\s*"([^"]+)"'
        ))[1] AS sprint_id
    FROM "MeetingNote" n
    WHERE n."noteType" = 'SPRINT_PLANNING'
      AND n.content LIKE '%data-info=%'
),
-- getSprintTypedNote serves the newest document, so that is the one whose
-- Decision and Risk people have actually been looking at.
newest AS (
    SELECT DISTINCT ON (sprint_id) sprint_id, content
    FROM linked
    WHERE sprint_id IS NOT NULL
    ORDER BY sprint_id, "createdAt" DESC
),
tags AS (
    SELECT newest.sprint_id, m[1] AS tag
    FROM newest,
         LATERAL regexp_matches(newest.content, '<div[^>]*data-type="sprint-task"[^>]*>', 'g') AS m
),
parsed AS (
    SELECT
        sprint_id,
        COALESCE(
            (regexp_match(tag, ' data-id="([^"]*)"'))[1],
            (regexp_match(replace(tag, '&quot;', '"'), '"id"\s*:\s*"([^"]+)"'))[1]
        ) AS task_id,
        COALESCE((regexp_match(tag, ' data-decision="([^"]*)"'))[1], '') AS decision_raw,
        COALESCE((regexp_match(tag, ' data-risk="([^"]*)"'))[1], '') AS risk_raw
    FROM tags
),
decoded AS (
    SELECT DISTINCT ON (sprint_id, task_id)
        sprint_id,
        task_id,
        replace(replace(replace(replace(replace(decision_raw,
            '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>'), '&amp;', '&') AS decision,
        replace(replace(replace(replace(replace(risk_raw,
            '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>'), '&amp;', '&') AS risk
    FROM parsed
    WHERE task_id IS NOT NULL
)
INSERT INTO "SprintTaskPlan" ("id", "sprintId", "taskId", "decision", "risk", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    d.sprint_id,
    d.task_id,
    d.decision,
    d.risk,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM decoded d
JOIN "Task" t ON t.id = d.task_id AND t."sprintId" = d.sprint_id
WHERE btrim(d.decision) <> '' OR btrim(d.risk) <> ''
ON CONFLICT ("sprintId", "taskId") DO NOTHING;
