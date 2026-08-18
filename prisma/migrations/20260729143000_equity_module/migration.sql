-- Equity module: per-project equity portfolios with repeatable contracts and
-- dilution tranches.
CREATE TABLE IF NOT EXISTS "EquityPortfolio" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "confidence" TEXT,
  "moaStatus" TEXT,
  "equityStatus" TEXT,
  "vestingStartDate" TIMESTAMP(3),
  "vestingEndDate" TIMESTAMP(3),
  "vestingFrequency" TEXT,
  "totalEquityPct" DOUBLE PRECISION,
  "dilutionDealType" TEXT,
  "valuationCurrency" TEXT NOT NULL DEFAULT 'KWD',
  "latestCapTableDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquityPortfolio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EquityPortfolio_projectId_key" ON "EquityPortfolio"("projectId");

CREATE TABLE IF NOT EXISTS "EquityContract" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "title" TEXT,
  "signed" BOOLEAN NOT NULL DEFAULT false,
  "startDate" TIMESTAMP(3),
  "lengthValue" DOUBLE PRECISION,
  "lengthUnit" TEXT,
  "endDate" TIMESTAMP(3),
  "notes" TEXT,
  "fileUrl" TEXT,
  "fileName" TEXT,
  "fileSize" INTEGER,
  "fileMimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquityContract_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EquityContract" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT;
ALTER TABLE "EquityContract" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "EquityContract" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
ALTER TABLE "EquityContract" ADD COLUMN IF NOT EXISTS "fileMimeType" TEXT;

CREATE INDEX IF NOT EXISTS "EquityContract_portfolioId_idx" ON "EquityContract"("portfolioId");

CREATE TABLE IF NOT EXISTS "EquityGrant" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "contractId" TEXT,
  "structureType" TEXT NOT NULL DEFAULT 'FIXED',
  "equityPct" DOUBLE PRECISION NOT NULL,
  "dividendFrequency" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquityGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EquityGrant_portfolioId_idx" ON "EquityGrant"("portfolioId");
CREATE INDEX IF NOT EXISTS "EquityGrant_contractId_idx" ON "EquityGrant"("contractId");

CREATE TABLE IF NOT EXISTS "EquityTranche" (
  "id" TEXT NOT NULL,
  "portfolioId" TEXT NOT NULL,
  "grantId" TEXT,
  "order" INTEGER NOT NULL,
  "equityPct" DOUBLE PRECISION NOT NULL,
  "startsAtValuation" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquityTranche_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EquityTranche" ADD COLUMN IF NOT EXISTS "grantId" TEXT;

CREATE INDEX IF NOT EXISTS "EquityTranche_portfolioId_idx" ON "EquityTranche"("portfolioId");
CREATE INDEX IF NOT EXISTS "EquityTranche_grantId_idx" ON "EquityTranche"("grantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquityPortfolio_projectId_fkey') THEN
    ALTER TABLE "EquityPortfolio"
      ADD CONSTRAINT "EquityPortfolio_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquityContract_portfolioId_fkey') THEN
    ALTER TABLE "EquityContract"
      ADD CONSTRAINT "EquityContract_portfolioId_fkey"
      FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquityGrant_portfolioId_fkey') THEN
    ALTER TABLE "EquityGrant"
      ADD CONSTRAINT "EquityGrant_portfolioId_fkey"
      FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquityGrant_contractId_fkey') THEN
    ALTER TABLE "EquityGrant"
      ADD CONSTRAINT "EquityGrant_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "EquityContract"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquityTranche_portfolioId_fkey') THEN
    ALTER TABLE "EquityTranche"
      ADD CONSTRAINT "EquityTranche_portfolioId_fkey"
      FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EquityTranche_grantId_fkey') THEN
    ALTER TABLE "EquityTranche"
      ADD CONSTRAINT "EquityTranche_grantId_fkey"
      FOREIGN KEY ("grantId") REFERENCES "EquityGrant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
