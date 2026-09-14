-- A company is now described rather than just named: an English and an Arabic
-- name, the industry it is in, and the countries it operates in.
--
-- `name` is dropped outright and the three new columns arrive NOT NULL with no
-- default, which is only safe because the table is empty. Backfilling an
-- Arabic name or an industry is not something a migration can invent, so had
-- there been rows this would have had to add the columns nullable, fill them by
-- hand and tighten them afterwards.

DROP INDEX "Company_name_key";

ALTER TABLE "Company" DROP COLUMN "name",
ADD COLUMN     "countries" TEXT[],
ADD COLUMN     "industry" TEXT NOT NULL,
ADD COLUMN     "nameAr" TEXT NOT NULL,
ADD COLUMN     "nameEn" TEXT NOT NULL;

CREATE UNIQUE INDEX "Company_nameEn_key" ON "Company"("nameEn");

CREATE UNIQUE INDEX "Company_nameAr_key" ON "Company"("nameAr");

-- The industry is there to be asked about ("every fintech we know"), so it is
-- worth an index of its own.
CREATE INDEX "Company_industry_idx" ON "Company"("industry");
