-- Field-level change log for deals, contacts, companies, and board cards.

CREATE TABLE "RecordHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordHistory_entityType_recordId_createdAt_idx" ON "RecordHistory"("entityType", "recordId", "createdAt");
CREATE INDEX "RecordHistory_batchId_idx" ON "RecordHistory"("batchId");
CREATE INDEX "RecordHistory_userId_idx" ON "RecordHistory"("userId");

ALTER TABLE "RecordHistory" ADD CONSTRAINT "RecordHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
