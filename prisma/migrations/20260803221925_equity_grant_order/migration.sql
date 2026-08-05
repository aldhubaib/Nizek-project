-- Rows in a split are now arranged by hand, so their position is stored rather
-- than inferred from createdAt, which ties when a whole split is written in one
-- transaction. Existing rows keep the order they were read in until they're
-- dragged: by creation time, then id to break the ties.

ALTER TABLE "EquityGrant" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

UPDATE "EquityGrant" g
SET "order" = ranked."position"
FROM (
    SELECT
        "id",
        ROW_NUMBER() OVER (PARTITION BY "setId" ORDER BY "createdAt", "id") AS "position"
    FROM "EquityGrant"
) AS ranked
WHERE ranked."id" = g."id";
