-- Business model lines carry an amount rather than a typed figure.
--
-- The old free-text figure is read where it can be: the first number in it, the
-- scale word after it and the currency it was written in. Only business model
-- rows are converted, since they are the ones the columns are for.
ALTER TABLE "EquityOpportunityItem"
  ADD COLUMN "value" DOUBLE PRECISION,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "currency" TEXT;

UPDATE "EquityOpportunityItem"
SET
  "value" = NULLIF(
    regexp_replace(substring("figure" FROM '[0-9][0-9,\.]*'), ',', '', 'g'),
    ''
  )::double precision,
  "unit" = CASE
    WHEN "figure" ~* '(trillion|\mtn\M)' THEN 'TRILLION'
    WHEN "figure" ~* '(billion|\mbn?\M)' THEN 'BILLION'
    WHEN "figure" ~* '(million|\mmm?\M)' THEN 'MILLION'
    WHEN "figure" ~* '(thousand|\mk\M)' THEN 'THOUSAND'
  END,
  "currency" = CASE
    WHEN "figure" ~* '(us\$|usd|\$)' THEN 'USD'
    WHEN "figure" ~* '(kwd|kd)' THEN 'KWD'
    WHEN "figure" ~* '(eur|€)' THEN 'EUR'
    WHEN "figure" ~* '(gbp|£)' THEN 'GBP'
    WHEN "figure" ~* 'sar' THEN 'SAR'
    WHEN "figure" ~* 'aed' THEN 'AED'
  END
WHERE "section" = 'BUSINESS_MODEL' AND "figure" IS NOT NULL;
