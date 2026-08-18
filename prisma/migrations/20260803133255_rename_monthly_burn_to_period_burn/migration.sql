-- Burn is now entered for the whole reporting period rather than per month, so
-- the column is renamed to match. Prisma's generated version dropped and re-added
-- the column, which would have discarded any burn figures already recorded; a
-- rename keeps them, and the values carry over unchanged because a report whose
-- burn was monthly is re-read through the same periodType it was filed under.
ALTER TABLE "EquityFinancialReport" RENAME COLUMN "monthlyBurn" TO "periodBurn";
