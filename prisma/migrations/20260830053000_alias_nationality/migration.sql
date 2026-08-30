-- Nationality on the alias pool. Curation metadata only: claiming still matches
-- on gender, so leaving this null never blocks an assignment.

ALTER TABLE "Alias" ADD COLUMN IF NOT EXISTS "nationality" TEXT;

CREATE INDEX IF NOT EXISTS "Alias_nationality_idx" ON "Alias"("nationality");
