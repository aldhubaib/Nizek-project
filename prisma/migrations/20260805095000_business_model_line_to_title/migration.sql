-- A business model row is a title and an amount now, where it used to be an
-- amount and a line describing it. The line is what the title says, so it moves
-- across rather than being dropped along with the column it was shown in.
UPDATE "EquityOpportunityItem"
SET "heading" = "body", "body" = NULL
WHERE "section" = 'BUSINESS_MODEL'
  AND COALESCE("heading", '') = ''
  AND COALESCE("body", '') <> '';
