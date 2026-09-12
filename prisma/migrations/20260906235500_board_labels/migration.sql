-- Labels: a tag a card can carry several of, unlike its one card type.

CREATE TABLE "BoardLabel" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'slate',
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BoardLabel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardLabel_boardId_position_idx" ON "BoardLabel"("boardId", "position");

ALTER TABLE "BoardLabel" ADD CONSTRAINT "BoardLabel_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BoardCardLabel" (
    "cardId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardCardLabel_pkey" PRIMARY KEY ("cardId", "labelId")
);

CREATE INDEX "BoardCardLabel_labelId_idx" ON "BoardCardLabel"("labelId");

ALTER TABLE "BoardCardLabel" ADD CONSTRAINT "BoardCardLabel_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "BoardCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardCardLabel" ADD CONSTRAINT "BoardCardLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "BoardLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
