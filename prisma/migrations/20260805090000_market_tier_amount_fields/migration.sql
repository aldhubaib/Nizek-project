-- Market size amounts become a number, a scale and a currency.
--
-- What was typed by hand is carried over where it can be read: the first number
-- in the line, the scale word after it, and the currency it was written in.
-- Anything the patterns don't recognise is left null rather than guessed at.
ALTER TABLE "EquityMarketTier"
  ADD COLUMN "value" DOUBLE PRECISION,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "currency" TEXT;

UPDATE "EquityMarketTier"
SET
  "value" = NULLIF(
    regexp_replace(substring("amount" FROM '[0-9][0-9,\.]*'), ',', '', 'g'),
    ''
  )::double precision,
  "unit" = CASE
    WHEN "amount" ~* '(trillion|\mtn\M)' THEN 'TRILLION'
    WHEN "amount" ~* '(billion|\mbn?\M)' THEN 'BILLION'
    WHEN "amount" ~* '(million|\mmm?\M)' THEN 'MILLION'
    WHEN "amount" ~* '(thousand|\mk\M)' THEN 'THOUSAND'
  END,
  "currency" = CASE
    WHEN "amount" ~* '(us\$|usd|\$)' THEN 'USD'
    WHEN "amount" ~* '(kwd|kd)' THEN 'KWD'
    WHEN "amount" ~* '(eur|€)' THEN 'EUR'
    WHEN "amount" ~* '(gbp|£)' THEN 'GBP'
    WHEN "amount" ~* 'sar' THEN 'SAR'
    WHEN "amount" ~* 'aed' THEN 'AED'
  END
WHERE "amount" IS NOT NULL;

ALTER TABLE "EquityMarketTier"
  DROP COLUMN "amount",
  DROP COLUMN "covers",
  DROP COLUMN "meaning";
