-- Give sprint documents a real foreign key to their sprint.
--
-- The link previously existed only as a sprint id inside the content HTML, so
-- getSprintTypedNote loaded every planning note's full body and substring-matched
-- it. That is slow, and worse, it had no ordering and no constraint: when two
-- people opened the planning view at the same moment, both created a document
-- and one of them silently became the one nobody's edits went into.

-- AlterTable
ALTER TABLE "MeetingNote" ADD COLUMN "sprintId" TEXT;

-- Backfill from the sprint-info node already embedded in the content.
UPDATE "MeetingNote" n
SET "sprintId" = s.id
FROM "Sprint" s
WHERE n."noteType" IN ('SPRINT_PLANNING', 'SPRINT_REVIEW')
  AND n."sprintId" IS NULL
  AND s.id = (
      regexp_match(
          replace(replace((regexp_match(n.content, 'data-info="([^"]*)"'))[1], '&quot;', '"'), '&amp;', '&'),
          '"sprintId"\s*:\s*"([^"]+)"'
      )
  )[1]
  AND s."projectId" = n."projectId";

-- Resolve duplicates before the unique index can exist. Keep the document with
-- the most Decision and Risk text filled in — that is the one people were
-- actually working in — and unlink the rest rather than deleting them, so
-- nothing written is destroyed by a migration.
WITH scored AS (
    SELECT
        n.id,
        n."sprintId",
        n."noteType",
        (length(n.content) - length(replace(n.content, 'data-decision="', ''))) AS decision_hits,
        (length(n.content) - length(replace(n.content, 'data-risk="', ''))) AS risk_hits,
        n."updatedAt"
    FROM "MeetingNote" n
    WHERE n."sprintId" IS NOT NULL
),
ranked AS (
    SELECT id, row_number() OVER (
        PARTITION BY "sprintId", "noteType"
        ORDER BY (decision_hits + risk_hits) DESC, "updatedAt" DESC
    ) AS rn
    FROM scored
)
UPDATE "MeetingNote" SET "sprintId" = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- CreateIndex
CREATE INDEX "MeetingNote_sprintId_idx" ON "MeetingNote"("sprintId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingNote_one_doc_per_sprint_type"
    ON "MeetingNote"("sprintId", "noteType") WHERE "sprintId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
