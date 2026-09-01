-- Financial reports become packs of monthly figures.
--
-- A pack is dated by when it was reported and carries a figure per field per
-- month, rather than being one figure for one period. That is what lets a later
-- pack restate an earlier month without overwriting what the earlier one said.
--
-- No project had entered any financial data when this ran, so the old period
-- columns are dropped outright instead of being backfilled. The truncate below
-- makes that explicit and keeps the migration correct if a stray row exists:
-- there is no honest month to assign a figure that was reported for "Q1", so
-- inventing one would be worse than starting empty.

TRUNCATE TABLE "EquityFinancialValue", "EquityFinancialDocument", "EquityFinancialReport";

-- ── The pack ────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS "EquityFinancialReport_portfolioId_periodStart_idx";
ALTER TABLE "EquityFinancialReport"
  DROP CONSTRAINT IF EXISTS "EquityFinancialReport_portfolioId_periodType_periodStart_key";

ALTER TABLE "EquityFinancialReport"
  DROP COLUMN "periodType",
  DROP COLUMN "periodStart",
  -- Dead since P&L and cash became defined fields in the metric registry, and
  -- since the operations block came off the form before that.
  DROP COLUMN "revenue",
  DROP COLUMN "cost",
  DROP COLUMN "cashInBank",
  DROP COLUMN "periodBurn",
  DROP COLUMN "customersGained",
  DROP COLUMN "customersLost",
  DROP COLUMN "teamSize",
  DROP COLUMN "raisingNextQuarter",
  DROP COLUMN "risks",
  DROP COLUMN "wins",
  ADD COLUMN "reportedOn" TIMESTAMP(3) NOT NULL;

CREATE UNIQUE INDEX "EquityFinancialReport_portfolioId_reportedOn_key"
  ON "EquityFinancialReport"("portfolioId", "reportedOn");
CREATE INDEX "EquityFinancialReport_portfolioId_reportedOn_idx"
  ON "EquityFinancialReport"("portfolioId", "reportedOn");

-- ── The monthly figure ──────────────────────────────────────────────────────

-- One figure per field per *pack* becomes one per field per *month*. Prisma
-- declares this key as a bare unique index rather than a table constraint, so
-- it has to be dropped as an index; dropping it as a constraint succeeds
-- silently while leaving it in place, which would refuse the second month of
-- every pack.
DROP INDEX IF EXISTS "EquityFinancialValue_reportId_metricId_key";

ALTER TABLE "EquityFinancialValue"
  ADD COLUMN "month" TIMESTAMP(3) NOT NULL;

CREATE UNIQUE INDEX "EquityFinancialValue_reportId_metricId_month_key"
  ON "EquityFinancialValue"("reportId", "metricId", "month");
CREATE INDEX "EquityFinancialValue_month_idx" ON "EquityFinancialValue"("month");

-- ── Exchange rates ──────────────────────────────────────────────────────────

CREATE TABLE "CurrencyRate" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "isBase" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CurrencyRate_code_key" ON "CurrencyRate"("code");
CREATE INDEX "CurrencyRate_isBase_idx" ON "CurrencyRate"("isBase");

-- One base currency, or every cross-project total would be ambiguous about what
-- it is denominated in. Same partial-unique trick as EquityHolder's "one of us".
CREATE UNIQUE INDEX "CurrencyRate_single_base" ON "CurrencyRate"("isBase") WHERE "isBase" = true;

-- KWD at 1, so a fresh install can already add up the projects it has. Every
-- portfolio's valuationCurrency defaults to KWD, so this is the base until
-- someone says otherwise.
INSERT INTO "CurrencyRate" ("id", "code", "rate", "isBase", "updatedAt")
VALUES ('seed_currency_rate_kwd', 'KWD', 1, true, CURRENT_TIMESTAMP);
