-- CreateTable
CREATE TABLE "EquityOpportunity" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "problem" TEXT,
    "solution" TEXT,
    "product" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquityOpportunityItem" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "heading" TEXT,
    "figure" TEXT,
    "caption" TEXT,
    "body" TEXT,
    "axisX" INTEGER,
    "axisY" INTEGER,
    "isUs" BOOLEAN NOT NULL DEFAULT false,
    "holderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquityOpportunityItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquityOpportunity_portfolioId_key" ON "EquityOpportunity"("portfolioId");

-- CreateIndex
CREATE INDEX "EquityOpportunityItem_opportunityId_section_order_idx" ON "EquityOpportunityItem"("opportunityId", "section", "order");

-- CreateIndex
CREATE INDEX "EquityOpportunityItem_holderId_idx" ON "EquityOpportunityItem"("holderId");

-- AddForeignKey
ALTER TABLE "EquityOpportunity" ADD CONSTRAINT "EquityOpportunity_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "EquityPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityOpportunityItem" ADD CONSTRAINT "EquityOpportunityItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "EquityOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquityOpportunityItem" ADD CONSTRAINT "EquityOpportunityItem_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "EquityHolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
