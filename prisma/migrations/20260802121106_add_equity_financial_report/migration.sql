-- CreateTable
CREATE TABLE "EquityFinancialReport" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "audited" BOOLEAN NOT NULL DEFAULT false,
    "revenue" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION,
    "cashInBank" DOUBLE PRECISION,
    "monthlyBurn" DOUBLE PRECISION,
    "customersGained" INTEGER,
    "customersLost" INTEGER,
    "teamSize" INTEGER,
    "raisingNextQuarter" BOOLEAN,
    "risks" TEXT,
    "wins" TEXT,
    "needsHelp" BOOLEAN NOT NULL DEFAULT false,
    "helpNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityFinancialReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityFinancialReport_portfolioId_periodStart_idx" ON "EquityFinancialReport"("portfolioId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "EquityFinancialReport_portfolioId_periodType_periodStart_key" ON "EquityFinancialReport"("portfolioId", "periodType", "periodStart");

-- AddForeignKey
ALTER TABLE "EquityFinancialReport" ADD CONSTRAINT "EquityFinancialReport_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
