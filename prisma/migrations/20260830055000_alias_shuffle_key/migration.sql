-- Randomise the order aliases are handed out in.
--
-- claimAlias previously took the oldest unclaimed alias, so a pool imported in
-- alphabetical order was assigned in alphabetical order — a pattern a client
-- could notice across a project. Ordering by a random key instead makes the
-- draw order independent of insert order.

ALTER TABLE "Alias" ADD COLUMN IF NOT EXISTS "shuffleKey" DOUBLE PRECISION NOT NULL DEFAULT random();

-- A volatile default is evaluated per row on ADD COLUMN, but assign explicitly
-- so the backfill is guaranteed regardless of Postgres version.
UPDATE "Alias" SET "shuffleKey" = random();

CREATE INDEX IF NOT EXISTS "Alias_gender_active_shuffleKey_idx" ON "Alias"("gender", "active", "shuffleKey");

-- Superseded by the index above, which shares its leading columns.
DROP INDEX IF EXISTS "Alias_gender_active_idx";
