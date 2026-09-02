-- A pack becomes a document you work on and then publish.
--
-- Until it is published nothing reads it, so a year can be entered over several
-- sittings without a half-filled column moving a total or restating a month.
--
-- Every pack that already exists was entered under the old rule, where saving
-- was publishing, so all of them are published as of now. Backfilling from
-- createdAt rather than a fixed timestamp keeps them in the order they were
-- filed.

ALTER TABLE "EquityFinancialReport"
  DROP COLUMN "needsHelp",
  DROP COLUMN "helpNotes",
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "draft" JSONB;

UPDATE "EquityFinancialReport" SET "publishedAt" = "createdAt";

-- One pack per date, but only among published ones. A draft is exempt: while
-- the date is being typed it passes through values that may belong to a pack
-- already filed, and refusing to save at that moment would lose the keystroke.
-- Prisma cannot express a partial index, so it is written here and the model
-- carries a plain @@index instead.
DROP INDEX IF EXISTS "EquityFinancialReport_portfolioId_reportedOn_key";

CREATE UNIQUE INDEX "EquityFinancialReport_published_date_key"
  ON "EquityFinancialReport"("portfolioId", "reportedOn")
  WHERE "publishedAt" IS NOT NULL;

CREATE INDEX "EquityFinancialReport_portfolioId_publishedAt_idx"
  ON "EquityFinancialReport"("portfolioId", "publishedAt");
