-- Sequential ids for deals, contacts, companies, and project-board cards.

CREATE TABLE "ModuleRecordCounter" (
    "entityType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ModuleRecordCounter_pkey" PRIMARY KEY ("entityType","scopeId")
);

ALTER TABLE "Deal" ADD COLUMN "recordNumber" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "recordNumber" INTEGER;
ALTER TABLE "Company" ADD COLUMN "recordNumber" INTEGER;
ALTER TABLE "BoardRecord" ADD COLUMN "recordNumber" INTEGER;

UPDATE "Deal" d
SET "recordNumber" = n.n
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "Deal"
) n
WHERE d.id = n.id;

UPDATE "Contact" c
SET "recordNumber" = n.n
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "Contact"
) n
WHERE c.id = n.id;

UPDATE "Company" c
SET "recordNumber" = n.n
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "Company"
) n
WHERE c.id = n.id;

UPDATE "BoardRecord" b
SET "recordNumber" = n.n
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "BoardRecord"
) n
WHERE b.id = n.id;

ALTER TABLE "Deal" ALTER COLUMN "recordNumber" SET NOT NULL;
ALTER TABLE "Contact" ALTER COLUMN "recordNumber" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "recordNumber" SET NOT NULL;
ALTER TABLE "BoardRecord" ALTER COLUMN "recordNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Deal_recordNumber_key" ON "Deal"("recordNumber");
CREATE UNIQUE INDEX "Contact_recordNumber_key" ON "Contact"("recordNumber");
CREATE UNIQUE INDEX "Company_recordNumber_key" ON "Company"("recordNumber");
CREATE UNIQUE INDEX "BoardRecord_projectId_recordNumber_key" ON "BoardRecord"("projectId", "recordNumber");

INSERT INTO "ModuleRecordCounter" ("entityType", "scopeId", "nextNumber")
SELECT 'deal', '', MAX("recordNumber") FROM "Deal"
HAVING MAX("recordNumber") IS NOT NULL;

INSERT INTO "ModuleRecordCounter" ("entityType", "scopeId", "nextNumber")
SELECT 'contact', '', MAX("recordNumber") FROM "Contact"
HAVING MAX("recordNumber") IS NOT NULL;

INSERT INTO "ModuleRecordCounter" ("entityType", "scopeId", "nextNumber")
SELECT 'company', '', MAX("recordNumber") FROM "Company"
HAVING MAX("recordNumber") IS NOT NULL;

INSERT INTO "ModuleRecordCounter" ("entityType", "scopeId", "nextNumber")
SELECT 'board', "projectId", MAX("recordNumber")
FROM "BoardRecord"
GROUP BY "projectId";
