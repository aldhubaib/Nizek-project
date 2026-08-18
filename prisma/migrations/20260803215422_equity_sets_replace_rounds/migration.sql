-- Versioned equity. A project's split is now a dated set of rows carrying its
-- own valuation, which answers the question funding rounds used to answer:
-- the earliest set is what we were granted, the latest is what we hold.
--
-- Existing rows become each portfolio's first set, dated from the earliest row
-- and priced at whatever valuation the portfolio was carrying.

CREATE TABLE "EquitySet" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "effectiveOn" TIMESTAMP(3) NOT NULL,
    "valuation" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquitySet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquitySet_portfolioId_idx" ON "EquitySet"("portfolioId");
CREATE INDEX "EquitySet_portfolioId_effectiveOn_idx" ON "EquitySet"("portfolioId", "effectiveOn");

ALTER TABLE "EquitySet" ADD CONSTRAINT "EquitySet_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One set per portfolio that already has rows. Portfolios with none get nothing:
-- an empty set would claim a split was agreed on a day no one agreed anything.
INSERT INTO "EquitySet" ("id", "portfolioId", "effectiveOn", "valuation", "createdAt", "updatedAt")
SELECT
    'set_' || p."id",
    p."id",
    COALESCE(MIN(g."createdAt"), p."createdAt"),
    p."currentValuation",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "EquityPortfolio" p
JOIN "EquityGrant" g ON g."portfolioId" = p."id"
GROUP BY p."id", p."currentValuation", p."createdAt";

ALTER TABLE "EquityGrant" ADD COLUMN "setId" TEXT;

UPDATE "EquityGrant" g
SET "setId" = s."id"
FROM "EquitySet" s
WHERE s."portfolioId" = g."portfolioId";

ALTER TABLE "EquityGrant" ALTER COLUMN "setId" SET NOT NULL;

CREATE INDEX "EquityGrant_setId_idx" ON "EquityGrant"("setId");

ALTER TABLE "EquityGrant" ADD CONSTRAINT "EquityGrant_setId_fkey"
    FOREIGN KEY ("setId") REFERENCES "EquitySet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rounds recorded ownership percentages too, so keeping them meant two tables
-- that could disagree about who owns what. The split is now the only one.
DROP TABLE "EquityHolding";
DROP TABLE "EquityRound";

-- The valuation moved onto the set it was agreed at.
ALTER TABLE "EquityPortfolio" DROP COLUMN "currentValuation";
