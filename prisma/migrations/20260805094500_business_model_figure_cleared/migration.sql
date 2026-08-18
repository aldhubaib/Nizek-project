-- The business model figure now lives in value, unit and currency, so the text
-- it was read from is cleared rather than left behind saying the same thing
-- twice in the history.
UPDATE "EquityOpportunityItem"
SET "figure" = NULL
WHERE "section" = 'BUSINESS_MODEL' AND "value" IS NOT NULL;
