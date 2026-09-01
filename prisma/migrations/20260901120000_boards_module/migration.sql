-- The Boards module: a standalone board per project.
--
-- Purely additive. Nothing here alters, drops or backfills an existing table,
-- and no existing row changes meaning: a project is on a board only once a
-- "Board" row names it, and until then every query in the app sees the schema
-- it saw yesterday. That is also why there is no flag on "Project" — the row
-- existing is the flag, so there is no second place to keep in step.
--
-- Ordering columns are DOUBLE PRECISION rather than INTEGER throughout. A card
-- dropped between two others is written at the midpoint of their neighbours'
-- positions, so a drag writes one row instead of renumbering a column.

-- ── The board ───────────────────────────────────────────────────────────────

CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Board',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- One board per project for now. Lifting this constraint is the whole of what
-- multi-board would need at the schema level, which is why every table below
-- points at a board rather than at a project.
CREATE UNIQUE INDEX "Board_projectId_key" ON "Board"("projectId");

-- ── Columns and card types ──────────────────────────────────────────────────

CREATE TABLE "BoardColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardColumn_boardId_position_idx" ON "BoardColumn"("boardId", "position");

CREATE TABLE "BoardCardType" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Sparkles',
    "color" TEXT NOT NULL DEFAULT 'slate',
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BoardCardType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardCardType_boardId_position_idx" ON "BoardCardType"("boardId", "position");

-- Columns mirror "DefaultQuestion" so the existing field renderer can be aimed
-- at these rows unchanged.
CREATE TABLE "BoardField" (
    "id" TEXT NOT NULL,
    "cardTypeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" TEXT,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BoardField_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardField_cardTypeId_position_idx" ON "BoardField"("cardTypeId", "position");

-- ── Cards ───────────────────────────────────────────────────────────────────

CREATE TABLE "BoardCard" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "cardNumber" INTEGER NOT NULL,
    "columnId" TEXT NOT NULL,
    "cardTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardCard_pkey" PRIMARY KEY ("id")
);

-- Its own sequence per board, never shared with "Task"."taskNumber": a shared
-- counter would couple the two systems through a sequence.
CREATE UNIQUE INDEX "BoardCard_boardId_cardNumber_key" ON "BoardCard"("boardId", "cardNumber");
CREATE INDEX "BoardCard_boardId_columnId_position_idx" ON "BoardCard"("boardId", "columnId", "position");
CREATE INDEX "BoardCard_boardId_archivedAt_idx" ON "BoardCard"("boardId", "archivedAt");
CREATE INDEX "BoardCard_columnId_idx" ON "BoardCard"("columnId");
CREATE INDEX "BoardCard_cardTypeId_idx" ON "BoardCard"("cardTypeId");
CREATE INDEX "BoardCard_assigneeId_idx" ON "BoardCard"("assigneeId");

CREATE TABLE "BoardFieldValue" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardFieldValue_pkey" PRIMARY KEY ("id")
);

-- A field is answered once per card. Twice would be two answers to one question.
CREATE UNIQUE INDEX "BoardFieldValue_cardId_fieldId_key" ON "BoardFieldValue"("cardId", "fieldId");
CREATE INDEX "BoardFieldValue_fieldId_idx" ON "BoardFieldValue"("fieldId");

-- ── Roles and membership ────────────────────────────────────────────────────

CREATE TABLE "BoardRole" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "canManageColumns" BOOLEAN NOT NULL DEFAULT false,
    "canManageTypes" BOOLEAN NOT NULL DEFAULT false,
    "canManageMembers" BOOLEAN NOT NULL DEFAULT false,
    "canCreateCard" BOOLEAN NOT NULL DEFAULT false,
    "canEditCard" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteCard" BOOLEAN NOT NULL DEFAULT false,
    "canMoveCard" BOOLEAN NOT NULL DEFAULT false,
    "canComment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardRole_boardId_name_key" ON "BoardRole"("boardId", "name");
CREATE INDEX "BoardRole_boardId_idx" ON "BoardRole"("boardId");

-- At most one fallback role per board, the same trick "EquityHolder"."isUs" and
-- "CurrencyRate"."isBase" use. A second default would be two answers to what an
-- unassigned member may do, and the guard reads exactly one row. Scoped to the
-- board rather than the table, since every board needs its own.
CREATE UNIQUE INDEX "BoardRole_single_default"
  ON "BoardRole"("boardId") WHERE "isDefault" = true;

CREATE TABLE "BoardMember" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardMember_boardId_userId_key" ON "BoardMember"("boardId", "userId");
CREATE INDEX "BoardMember_userId_idx" ON "BoardMember"("userId");
CREATE INDEX "BoardMember_roleId_idx" ON "BoardMember"("roleId");

-- ── Card discussion ─────────────────────────────────────────────────────────

CREATE TABLE "BoardCardComment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardCardComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardCardComment_cardId_createdAt_idx" ON "BoardCardComment"("cardId", "createdAt");

-- ── Foreign keys ────────────────────────────────────────────────────────────
--
-- RESTRICT rather than CASCADE where deleting the parent would silently take
-- work with it: a column that still holds cards, a card type still in use, a
-- role somebody still holds. Those deletions are refused and explained instead.

ALTER TABLE "Board" ADD CONSTRAINT "Board_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardCardType" ADD CONSTRAINT "BoardCardType_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardField" ADD CONSTRAINT "BoardField_cardTypeId_fkey"
  FOREIGN KEY ("cardTypeId") REFERENCES "BoardCardType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardCard" ADD CONSTRAINT "BoardCard_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardCard" ADD CONSTRAINT "BoardCard_columnId_fkey"
  FOREIGN KEY ("columnId") REFERENCES "BoardColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BoardCard" ADD CONSTRAINT "BoardCard_cardTypeId_fkey"
  FOREIGN KEY ("cardTypeId") REFERENCES "BoardCardType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BoardCard" ADD CONSTRAINT "BoardCard_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BoardCard" ADD CONSTRAINT "BoardCard_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardFieldValue" ADD CONSTRAINT "BoardFieldValue_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "BoardCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardFieldValue" ADD CONSTRAINT "BoardFieldValue_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "BoardField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardRole" ADD CONSTRAINT "BoardRole_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardMember" ADD CONSTRAINT "BoardMember_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardMember" ADD CONSTRAINT "BoardMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardMember" ADD CONSTRAINT "BoardMember_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "BoardRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BoardCardComment" ADD CONSTRAINT "BoardCardComment_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "BoardCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardCardComment" ADD CONSTRAINT "BoardCardComment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
