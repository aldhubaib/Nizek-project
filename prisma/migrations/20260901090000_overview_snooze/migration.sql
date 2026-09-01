-- CreateTable
CREATE TABLE "OverviewSnooze" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverviewSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OverviewSnooze_userId_until_idx" ON "OverviewSnooze"("userId", "until");

-- CreateIndex
CREATE INDEX "OverviewSnooze_projectId_idx" ON "OverviewSnooze"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "OverviewSnooze_userId_projectId_signalType_key" ON "OverviewSnooze"("userId", "projectId", "signalType");

-- AddForeignKey
ALTER TABLE "OverviewSnooze" ADD CONSTRAINT "OverviewSnooze_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverviewSnooze" ADD CONSTRAINT "OverviewSnooze_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
