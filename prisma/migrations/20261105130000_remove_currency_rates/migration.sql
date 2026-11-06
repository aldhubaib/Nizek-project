-- Remove exchange rates. Figures are no longer converted between currencies:
-- the cross-project financials add projects up only when they all report in the
-- same currency. The table and its indexes go; this drops the hand-entered rates.
DROP TABLE IF EXISTS "CurrencyRate";
