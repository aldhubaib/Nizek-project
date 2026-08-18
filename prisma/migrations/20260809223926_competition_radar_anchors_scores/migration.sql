-- AlterTable
ALTER TABLE "EquityOpportunity" ADD COLUMN     "radarAnchors" TEXT[];

-- AlterTable
ALTER TABLE "EquityOpportunityItem" ADD COLUMN     "scores" JSONB;
