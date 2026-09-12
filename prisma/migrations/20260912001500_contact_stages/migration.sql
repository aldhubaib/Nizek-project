-- Contacts become a board: columns are stages the team names and reorders,
-- and a contact sits in one of them.

ALTER TABLE "Contact" ADD COLUMN     "stageId" TEXT;

CREATE TABLE "ContactStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactStage_name_key" ON "ContactStage"("name");

CREATE INDEX "ContactStage_position_idx" ON "ContactStage"("position");

CREATE INDEX "Contact_stageId_idx" ON "Contact"("stageId");

-- Clearing rather than cascading: deleting a column must not delete people. A
-- contact left without a stage shows up in the board's "Unassigned" column.
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ContactStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A starting pipeline, so the board is usable the first time it is opened
-- rather than empty. These are ordinary rows: rename, recolour or delete them.
-- Positions follow POSITION_STEP = 1024 from src/lib/board-order.ts.
INSERT INTO "ContactStage" ("id", "name", "color", "position", "updatedAt") VALUES
    ('ctstage_seed_lead',      'Lead',      'slate',   1024, CURRENT_TIMESTAMP),
    ('ctstage_seed_contacted', 'Contacted', 'sky',     2048, CURRENT_TIMESTAMP),
    ('ctstage_seed_qualified', 'Qualified', 'violet',  3072, CURRENT_TIMESTAMP),
    ('ctstage_seed_client',    'Client',    'emerald', 4096, CURRENT_TIMESTAMP);

-- Whoever was already in the directory starts at the front of the pipeline, so
-- nobody lands in Unassigned on the first open.
UPDATE "Contact" SET "stageId" = 'ctstage_seed_lead' WHERE "stageId" IS NULL;
