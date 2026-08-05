-- CreateTable
CREATE TABLE "EquityTeamSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "effectiveOn" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityTeamSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityTeamMember" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquityTeamSnapshot_portfolioId_effectiveOn_idx" ON "EquityTeamSnapshot"("portfolioId", "effectiveOn");

-- CreateIndex
CREATE INDEX "EquityTeamMember_snapshotId_order_idx" ON "EquityTeamMember"("snapshotId", "order");

-- CreateIndex
CREATE INDEX "EquityTeamMember_holderId_idx" ON "EquityTeamMember"("holderId");

-- CreateIndex
CREATE UNIQUE INDEX "EquityTeamMember_snapshotId_holderId_key" ON "EquityTeamMember"("snapshotId", "holderId");

-- AddForeignKey
ALTER TABLE "EquityTeamSnapshot" ADD CONSTRAINT "EquityTeamSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityTeamMember" ADD CONSTRAINT "EquityTeamMember_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "EquityTeamSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityTeamMember" ADD CONSTRAINT "EquityTeamMember_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "EquityHolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The team moves out of the opportunity and becomes its own dated module. Every
-- portfolio that had members gets one lineup to hold them, dated today: nobody
-- was ever asked when the team started, and today is the only date the existing
-- rows can honestly claim. The next lineup entered dates itself properly.
INSERT INTO "EquityTeamSnapshot" ("id", "portfolioId", "effectiveOn", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       o."portfolioId",
       date_trunc('day', NOW() AT TIME ZONE 'UTC'),
       NOW(),
       NOW()
FROM "EquityOpportunity" o
WHERE EXISTS (
  SELECT 1 FROM "EquityOpportunityItem" i
  WHERE i."opportunityId" = o."id"
    AND i."section" = 'TEAM'
    AND i."holderId" IS NOT NULL
);

INSERT INTO "EquityTeamMember" ("id", "snapshotId", "holderId", "title", "body", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."id", i."holderId", i."caption", i."body", i."order", NOW(), NOW()
FROM "EquityOpportunityItem" i
JOIN "EquityOpportunity" o ON o."id" = i."opportunityId"
JOIN "EquityTeamSnapshot" s ON s."portfolioId" = o."portfolioId"
WHERE i."section" = 'TEAM'
  AND i."holderId" IS NOT NULL
ON CONFLICT ("snapshotId", "holderId") DO NOTHING;

-- Including any row that named nobody: the module is a list of people, and a
-- team member with no name is not one of them.
DELETE FROM "EquityOpportunityItem" WHERE "section" = 'TEAM';
