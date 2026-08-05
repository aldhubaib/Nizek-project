-- A name on a cap table now carries who it belongs to. The free-text column is
-- renamed rather than duplicated: it was never surfaced anywhere, and a second
-- prose field beside it would only leave two places to write the same thing.

ALTER TABLE "EquityHolder" RENAME COLUMN "notes" TO "bio";
ALTER TABLE "EquityHolder" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "EquityHolder" ADD COLUMN "linkedinUrl" TEXT;
