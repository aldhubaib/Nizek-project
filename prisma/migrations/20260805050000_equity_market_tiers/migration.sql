-- CreateTable
CREATE TABLE "EquityMarketTier" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "tier" TEXT,
    "amount" TEXT,
    "covers" TEXT,
    "meaning" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityMarketTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityMarketTier_portfolioId_order_idx" ON "EquityMarketTier"("portfolioId", "order");

-- AddForeignKey
ALTER TABLE "EquityMarketTier" ADD CONSTRAINT "EquityMarketTier_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Market size moves out of the opportunity and becomes its own module, so the
-- tiers already written move with it rather than being re-entered. The old
-- columns line up one for one: heading was the tier's name, figure the amount
-- as typed, body what that amount counts, caption why the tier sits where it
-- does.
INSERT INTO "EquityMarketTier" ("id", "portfolioId", "tier", "amount", "covers", "meaning", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       o."portfolioId",
       i."heading",
       i."figure",
       i."body",
       i."caption",
       i."order",
       NOW(),
       NOW()
FROM "EquityOpportunityItem" i
JOIN "EquityOpportunity" o ON o."id" = i."opportunityId"
WHERE i."section" = 'MARKET_SIZE';

DELETE FROM "EquityOpportunityItem" WHERE "section" = 'MARKET_SIZE';
