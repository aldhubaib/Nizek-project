-- The per-project questionnaire goes away: every project's report is now made
-- of every financial field in the registry, in the order the registry lists
-- them.
--
-- What this gives up is the Required flag, which had already stopped meaning
-- anything once publishing was made non-blocking, and the per-project ordering,
-- which the registry's own order now covers.
--
-- No reported figure is lost. This table held questions, not answers — the
-- figures live in EquityFinancialValue and are untouched. A field the registry
-- still has is simply asked of everyone now, and a month nobody reported stays
-- blank, which the grid has always distinguished from a reported zero.

DROP TABLE "EquityPortfolioField";
