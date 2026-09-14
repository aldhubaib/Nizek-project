-- Let a form section render as one or two columns. Default one so every
-- existing section keeps its current stacked layout.

ALTER TABLE "CustomFieldSection" ADD COLUMN "columns" INTEGER NOT NULL DEFAULT 1;
