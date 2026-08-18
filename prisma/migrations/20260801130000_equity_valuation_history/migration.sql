-- Equity valuation history: dated company valuations under a portfolio, so the
-- trend is kept rather than just the latest number.
CREATE TABLE IF NOT EXISTS "EquityValuation" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "valuedAt" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquityValuation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EquityValuation_portfolioId_idx" ON "EquityValuation"("portfolioId");
CREATE INDEX IF NOT EXISTS "EquityValuation_portfolioId_valuedAt_idx" ON "EquityValuation"("portfolioId", "valuedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquityValuation_portfolioId_fkey') THEN
    ALTER TABLE "EquityValuation"
      ADD CONSTRAINT "EquityValuation_portfolioId_fkey"
      FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
