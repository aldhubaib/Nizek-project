-- Proof of work videos and one-time manager bypass passes for Internal Review.

CREATE TABLE "ProofOfWork" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "bypassedById" TEXT,
    "bypassedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofOfWork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofOfWorkVideo" (
    "id" TEXT NOT NULL,
    "proofId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofOfWorkVideo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProofBypassPass" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ProofBypassPass_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProofOfWork_taskId_createdAt_idx" ON "ProofOfWork"("taskId", "createdAt");
CREATE INDEX "ProofOfWorkVideo_proofId_idx" ON "ProofOfWorkVideo"("proofId");
CREATE UNIQUE INDEX "ProofBypassPass_code_key" ON "ProofBypassPass"("code");
CREATE INDEX "ProofBypassPass_taskId_status_idx" ON "ProofBypassPass"("taskId", "status");
CREATE INDEX "ProofBypassPass_code_idx" ON "ProofBypassPass"("code");

ALTER TABLE "ProofOfWork" ADD CONSTRAINT "ProofOfWork_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofOfWork" ADD CONSTRAINT "ProofOfWork_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofOfWork" ADD CONSTRAINT "ProofOfWork_bypassedById_fkey" FOREIGN KEY ("bypassedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProofOfWorkVideo" ADD CONSTRAINT "ProofOfWorkVideo_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "ProofOfWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofBypassPass" ADD CONSTRAINT "ProofBypassPass_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofBypassPass" ADD CONSTRAINT "ProofBypassPass_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProofBypassPass" ADD CONSTRAINT "ProofBypassPass_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
