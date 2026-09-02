-- Lets a board be hidden without being deleted.
--
-- The mirror of "Project"."sprintsEnabled": a project runs sprints, a board, or
-- both, and either side can be switched off. Off hides the tab and nothing more,
-- so every column, card type and card survives and comes back untouched when it
-- is switched on again.
--
-- Defaulted true so every board added before this keeps showing.

ALTER TABLE "Board" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
