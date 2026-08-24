-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "Sprint" AS s
SET "sortOrder" = sub.rn - 1
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "startDate" ASC, "createdAt" ASC
    ) AS rn
  FROM "Sprint"
  WHERE status IN ('PLANNED', 'NEXT')
) AS sub
WHERE s.id = sub.id;
