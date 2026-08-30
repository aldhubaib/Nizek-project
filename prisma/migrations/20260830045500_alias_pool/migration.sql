-- Alias pool + per-project assignments.

CREATE TABLE IF NOT EXISTS "Alias" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "imageUrl" TEXT,
    "r2Key" TEXT,
    "contentType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AliasAssignment" (
    "id" TEXT NOT NULL,
    "aliasId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AliasAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Alias_gender_active_idx" ON "Alias"("gender", "active");

-- One alias is consumed once: this is what stops an alias appearing on two projects.
CREATE UNIQUE INDEX IF NOT EXISTS "AliasAssignment_aliasId_key" ON "AliasAssignment"("aliasId");
CREATE UNIQUE INDEX IF NOT EXISTS "AliasAssignment_userId_projectId_key" ON "AliasAssignment"("userId", "projectId");
CREATE INDEX IF NOT EXISTS "AliasAssignment_projectId_idx" ON "AliasAssignment"("projectId");
CREATE INDEX IF NOT EXISTS "AliasAssignment_userId_idx" ON "AliasAssignment"("userId");

DO $$ BEGIN
    ALTER TABLE "AliasAssignment" ADD CONSTRAINT "AliasAssignment_aliasId_fkey" FOREIGN KEY ("aliasId") REFERENCES "Alias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AliasAssignment" ADD CONSTRAINT "AliasAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AliasAssignment" ADD CONSTRAINT "AliasAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
