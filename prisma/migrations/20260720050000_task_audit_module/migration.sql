-- Task Audit module: per-team audit grants, daily audit reports, and
-- snapshotted flagged items with the manager's verdict.

CREATE TABLE IF NOT EXISTS "AuditPermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "grantedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuditPermission_userId_teamId_key"
  ON "AuditPermission"("userId", "teamId");

CREATE INDEX IF NOT EXISTS "AuditPermission_userId_idx"
  ON "AuditPermission"("userId");

DO $$ BEGIN
  ALTER TABLE "AuditPermission"
    ADD CONSTRAINT "AuditPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditPermission"
    ADD CONSTRAINT "AuditPermission_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TaskAudit" (
  "id" TEXT NOT NULL,
  "auditDate" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "teamIds" TEXT[],
  "teamNames" TEXT[],
  "status" TEXT NOT NULL DEFAULT 'draft',
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskAudit_createdById_auditDate_key"
  ON "TaskAudit"("createdById", "auditDate");

CREATE INDEX IF NOT EXISTS "TaskAudit_auditDate_idx"
  ON "TaskAudit"("auditDate");

DO $$ BEGIN
  ALTER TABLE "TaskAudit"
    ADD CONSTRAINT "TaskAudit_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TaskAuditItem" (
  "id" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "taskId" TEXT,
  "noteId" TEXT,
  "flagType" TEXT NOT NULL,
  "severity" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "taskNumber" INTEGER,
  "projectId" TEXT NOT NULL,
  "projectName" TEXT NOT NULL,
  "teamName" TEXT,
  "stage" TEXT,
  "stageLabel" TEXT,
  "stageHours" INTEGER,
  "declineCount" INTEGER,
  "dueInDays" INTEGER,
  "assigneeId" TEXT,
  "assigneeName" TEXT,
  "carriedOver" BOOLEAN NOT NULL DEFAULT false,
  "verdict" TEXT NOT NULL DEFAULT 'pending',
  "blamedUserId" TEXT,
  "reasonNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "TaskAuditItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskAuditItem_auditId_idx"
  ON "TaskAuditItem"("auditId");

CREATE INDEX IF NOT EXISTS "TaskAuditItem_taskId_idx"
  ON "TaskAuditItem"("taskId");

CREATE INDEX IF NOT EXISTS "TaskAuditItem_noteId_idx"
  ON "TaskAuditItem"("noteId");

CREATE INDEX IF NOT EXISTS "TaskAuditItem_blamedUserId_idx"
  ON "TaskAuditItem"("blamedUserId");

DO $$ BEGIN
  ALTER TABLE "TaskAuditItem"
    ADD CONSTRAINT "TaskAuditItem_auditId_fkey"
    FOREIGN KEY ("auditId") REFERENCES "TaskAudit"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskAuditItem"
    ADD CONSTRAINT "TaskAuditItem_blamedUserId_fkey"
    FOREIGN KEY ("blamedUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
