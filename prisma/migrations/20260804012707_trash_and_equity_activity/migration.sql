-- AlterTable
ALTER TABLE "EquityPortfolio" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EquityActivity" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT,
    "label" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquityActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrashItem" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sublabel" TEXT,
    "deletedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityActivity_portfolioId_createdAt_idx" ON "EquityActivity"("portfolioId", "createdAt");

-- CreateIndex
CREATE INDEX "EquityActivity_portfolioId_section_createdAt_idx" ON "EquityActivity"("portfolioId", "section", "createdAt");

-- CreateIndex
CREATE INDEX "TrashItem_deletedAt_idx" ON "TrashItem"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrashItem_entityType_entityId_key" ON "TrashItem"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EquityPortfolio_deletedAt_idx" ON "EquityPortfolio"("deletedAt");

-- AddForeignKey
ALTER TABLE "EquityActivity" ADD CONSTRAINT "EquityActivity_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityActivity" ADD CONSTRAINT "EquityActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrashItem" ADD CONSTRAINT "TrashItem_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
