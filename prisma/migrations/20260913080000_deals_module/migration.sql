-- Deals sit on their own kanban, linked to contacts and companies. Stages
-- are a separate table from ContactStage so the two pipelines can be named
-- and ordered independently.

CREATE TABLE "DealStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealStage_name_key" ON "DealStage"("name");
CREATE INDEX "DealStage_position_idx" ON "DealStage"("position");

CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DECIMAL(14,3),
    "stageId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Deal_stageId_idx" ON "Deal"("stageId");
CREATE INDEX "Deal_createdById_idx" ON "Deal"("createdById");
CREATE INDEX "Deal_title_idx" ON "Deal"("title");

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "DealStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DealContact" (
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "DealContact_pkey" PRIMARY KEY ("dealId","contactId")
);

CREATE INDEX "DealContact_contactId_idx" ON "DealContact"("contactId");

ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DealCompany" (
    "dealId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "DealCompany_pkey" PRIMARY KEY ("dealId","companyId")
);

CREATE INDEX "DealCompany_companyId_idx" ON "DealCompany"("companyId");

ALTER TABLE "DealCompany" ADD CONSTRAINT "DealCompany_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealCompany" ADD CONSTRAINT "DealCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A starting pipeline. Ordinary rows: rename, recolour or delete them.
-- Positions follow POSITION_STEP = 1024 from src/lib/board-order.ts.
INSERT INTO "DealStage" ("id", "name", "color", "position", "updatedAt") VALUES
    ('dlstage_seed_lead',      'Lead',      'slate',   1024, CURRENT_TIMESTAMP),
    ('dlstage_seed_qualified', 'Qualified', 'sky',     2048, CURRENT_TIMESTAMP),
    ('dlstage_seed_proposal',  'Proposal',  'violet',  3072, CURRENT_TIMESTAMP),
    ('dlstage_seed_won',       'Won',       'emerald', 4096, CURRENT_TIMESTAMP);
