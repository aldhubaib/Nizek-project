-- Multiple deal flows, each with its own kanban and a blueprint of allowed
-- moves plus the fields that must be filled before leaving a stage.

CREATE TABLE "DealFlow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealFlow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealFlow_name_key" ON "DealFlow"("name");
CREATE INDEX "DealFlow_position_idx" ON "DealFlow"("position");

-- Existing stages and deals become the first flow rather than being dropped.
INSERT INTO "DealFlow" ("id", "name", "position", "updatedAt")
VALUES ('dlflow_seed_sales', 'Sales', 1024, CURRENT_TIMESTAMP);

ALTER TABLE "DealStage" ADD COLUMN "flowId" TEXT;
UPDATE "DealStage" SET "flowId" = 'dlflow_seed_sales' WHERE "flowId" IS NULL;
ALTER TABLE "DealStage" ALTER COLUMN "flowId" SET NOT NULL;

DROP INDEX IF EXISTS "DealStage_name_key";
DROP INDEX IF EXISTS "DealStage_position_idx";

CREATE UNIQUE INDEX "DealStage_flowId_name_key" ON "DealStage"("flowId", "name");
CREATE INDEX "DealStage_flowId_position_idx" ON "DealStage"("flowId", "position");

ALTER TABLE "DealStage" ADD CONSTRAINT "DealStage_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "DealFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Deal" ADD COLUMN "flowId" TEXT;
UPDATE "Deal" SET "flowId" = 'dlflow_seed_sales' WHERE "flowId" IS NULL;
ALTER TABLE "Deal" ALTER COLUMN "flowId" SET NOT NULL;

CREATE INDEX "Deal_flowId_stageId_idx" ON "Deal"("flowId", "stageId");

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "DealFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DealTransition" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "fromStageId" TEXT NOT NULL,
    "toStageId" TEXT NOT NULL,

    CONSTRAINT "DealTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealTransition_fromStageId_toStageId_key" ON "DealTransition"("fromStageId", "toStageId");
CREATE INDEX "DealTransition_flowId_idx" ON "DealTransition"("flowId");
CREATE INDEX "DealTransition_toStageId_idx" ON "DealTransition"("toStageId");

ALTER TABLE "DealTransition" ADD CONSTRAINT "DealTransition_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "DealFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealTransition" ADD CONSTRAINT "DealTransition_fromStageId_fkey"
  FOREIGN KEY ("fromStageId") REFERENCES "DealStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealTransition" ADD CONSTRAINT "DealTransition_toStageId_fkey"
  FOREIGN KEY ("toStageId") REFERENCES "DealStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DealStageRequirement" (
    "stageId" TEXT NOT NULL,
    "field" TEXT NOT NULL,

    CONSTRAINT "DealStageRequirement_pkey" PRIMARY KEY ("stageId","field")
);

ALTER TABLE "DealStageRequirement" ADD CONSTRAINT "DealStageRequirement_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "DealStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
