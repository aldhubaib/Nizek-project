-- Valuations are folded into rounds. Every valuation on record came from a
-- raise, so keeping a second table only gave two places to disagree about what
-- a company is worth.
--
-- Existing rows are carried across rather than dropped. ownershipPctAfter is
-- required on a round but unknowable for a bare valuation, so it falls back to
-- the portfolio's granted total — no dilution was ever recorded against these
-- rows, which is exactly what "still the granted stake" means. The original id
-- is kept so a migrated row can still be traced back.
INSERT INTO "EquityRound" (
  id,
  "portfolioId",
  name,
  "closedAt",
  "ownershipPctAfter",
  "postMoneyValuation",
  notes,
  "createdAt",
  "updatedAt"
)
SELECT
  v.id,
  v."portfolioId",
  'Valuation',
  v."valuedAt",
  COALESCE(
    (SELECT SUM(g."equityPct") FROM "EquityGrant" g WHERE g."portfolioId" = v."portfolioId"),
    0
  ),
  v.amount,
  v.notes,
  v."createdAt",
  NOW()
FROM "EquityValuation" v;

DROP TABLE "EquityValuation";
