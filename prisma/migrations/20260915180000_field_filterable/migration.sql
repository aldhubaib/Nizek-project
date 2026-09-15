-- Per-field opt-in so a layout can offer a field as a board/list filter.

ALTER TABLE "CustomField" ADD COLUMN "filterable" BOOLEAN NOT NULL DEFAULT false;
