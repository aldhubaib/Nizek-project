-- CreateTable
CREATE TABLE "EquityTractionMilestone" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "happenedOn" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityTractionMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityTractionMilestone_portfolioId_happenedOn_idx" ON "EquityTractionMilestone"("portfolioId", "happenedOn");

-- AddForeignKey
ALTER TABLE "EquityTractionMilestone" ADD CONSTRAINT "EquityTractionMilestone_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
