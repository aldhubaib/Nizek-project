-- CreateTable
CREATE TABLE "EquityPortfolioField" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityPortfolioField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityPortfolioField_portfolioId_order_idx" ON "EquityPortfolioField"("portfolioId", "order");

-- CreateIndex
CREATE INDEX "EquityPortfolioField_metricId_idx" ON "EquityPortfolioField"("metricId");

-- CreateIndex
CREATE UNIQUE INDEX "EquityPortfolioField_portfolioId_metricId_key" ON "EquityPortfolioField"("portfolioId", "metricId");

-- AddForeignKey
ALTER TABLE "EquityPortfolioField" ADD CONSTRAINT "EquityPortfolioField_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityPortfolioField" ADD CONSTRAINT "EquityPortfolioField_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "EquityMetric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every project starts asking for every financial field, none of them required,
-- which is exactly how the form behaved before this table existed. Requiring a
-- figure is then something someone chooses per project rather than something a
-- migration decides on their behalf — and nobody's next report is blocked by an
-- upgrade they didn't ask for.
--
-- Soft-deleted portfolios are included: they can come back, and a restored one
-- with no questions on its form would be a puzzle to work out later.
INSERT INTO "EquityPortfolioField" ("id", "portfolioId", "metricId", "required", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", m."id", false, m."order", NOW(), NOW()
FROM "EquityPortfolio" p
CROSS JOIN "EquityMetric" m
WHERE m."group" = 'FINANCIAL'
ON CONFLICT ("portfolioId", "metricId") DO NOTHING;
