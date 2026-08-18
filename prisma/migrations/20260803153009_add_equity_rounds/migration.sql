-- CreateTable
CREATE TABLE "EquityRound" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "ownershipPctAfter" DOUBLE PRECISION NOT NULL,
    "postMoneyValuation" DOUBLE PRECISION,
    "investmentAmount" DOUBLE PRECISION,
    "investorName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityRound_portfolioId_idx" ON "EquityRound"("portfolioId");

-- CreateIndex
CREATE INDEX "EquityRound_portfolioId_closedAt_idx" ON "EquityRound"("portfolioId", "closedAt");

-- AddForeignKey
ALTER TABLE "EquityRound" ADD CONSTRAINT "EquityRound_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
