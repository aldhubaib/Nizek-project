-- Who actually clicked accept, when it was not the client themselves.
--
-- Null on every existing row, which is the truthful reading: until now an
-- admin viewing as a client could not accept at all, so every acceptance
-- already recorded was the client's own.

ALTER TABLE "ClientAgreementAcceptance" ADD COLUMN "acceptedById" TEXT;

ALTER TABLE "ClientAgreementAcceptance"
    ADD CONSTRAINT "ClientAgreementAcceptance_acceptedById_fkey"
    FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ClientAgreementAcceptance_acceptedById_idx" ON "ClientAgreementAcceptance"("acceptedById");
