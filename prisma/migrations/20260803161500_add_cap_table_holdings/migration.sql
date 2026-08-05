-- Ownership becomes a cap table per round rather than a single percentage for
-- us, so the split between us, the founders and new investors is recorded
-- instead of inferred.

CREATE TABLE "EquityHolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isUs" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityHolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EquityHolder_name_key" ON "EquityHolder"("name");
CREATE INDEX "EquityHolder_isUs_idx" ON "EquityHolder"("isUs");

-- At most one holder can be us. A plain unique column would forbid more than
-- one holder that isn't us, so the constraint is limited to the true rows.
CREATE UNIQUE INDEX "EquityHolder_single_us" ON "EquityHolder"("isUs") WHERE "isUs" = true;

CREATE TABLE "EquityHolding" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "pct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EquityHolding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EquityHolding_roundId_holderId_key" ON "EquityHolding"("roundId", "holderId");
CREATE INDEX "EquityHolding_roundId_idx" ON "EquityHolding"("roundId");
CREATE INDEX "EquityHolding_holderId_idx" ON "EquityHolding"("holderId");

ALTER TABLE "EquityHolding" ADD CONSTRAINT "EquityHolding_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "EquityRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquityHolding" ADD CONSTRAINT "EquityHolding_holderId_fkey"
    FOREIGN KEY ("holderId") REFERENCES "EquityHolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Our own percentage moves off the round and onto our line of each cap table.
-- Seed the holder that represents us, then give it the percentage every
-- existing round already recorded, so no figure is lost to the change.
INSERT INTO "EquityHolder" ("id", "name", "isUs", "kind", "createdAt", "updatedAt")
VALUES ('equity-holder-us', 'Nizek', true, 'INVESTOR', NOW(), NOW());

INSERT INTO "EquityHolding" ("id", "roundId", "holderId", "pct")
SELECT
  'holding-us-' || r.id,
  r.id,
  'equity-holder-us',
  r."ownershipPctAfter"
FROM "EquityRound" r;

ALTER TABLE "EquityRound" DROP COLUMN "ownershipPctAfter";
