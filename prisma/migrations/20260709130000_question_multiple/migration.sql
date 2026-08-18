-- Allow dropdown questions to accept multiple selected options.
-- Idempotent so this is safe against databases that already have the column.

ALTER TABLE "DefaultQuestion" ADD COLUMN IF NOT EXISTS "multiple" BOOLEAN NOT NULL DEFAULT false;
