-- Equity access moves from a hardcoded email allowlist to a granted permission
-- row, so admins can hand it out from the UI instead of shipping a deploy.

CREATE TABLE IF NOT EXISTS "EquityPermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquityPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EquityPermission_userId_key"
  ON "EquityPermission"("userId");

DO $$ BEGIN
  ALTER TABLE "EquityPermission"
    ADD CONSTRAINT "EquityPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Carry over the allowlist this table replaces, so whoever had access before
-- the migration still has it afterwards. md5() rather than gen_random_uuid()
-- to avoid depending on pgcrypto or a particular Postgres version.
INSERT INTO "EquityPermission" ("id", "userId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  "id",
  CURRENT_TIMESTAMP
FROM "User"
WHERE lower("email") IN ('aldhubaib@nizek.com')
ON CONFLICT ("userId") DO NOTHING;
