-- Lets a project opt out of the sprint pipeline.
--
-- Additive, and defaulted true so every existing project keeps the Road map and
-- Active sprint tabs it has today. Nothing is read differently until somebody
-- turns the flag off from project settings.
--
-- This is stored rather than inferred, unlike the board, which is switched on by
-- the existence of a "Board" row. There is no equivalent signal here: a project
-- with no sprints yet and a project that will never run sprints look the same.

ALTER TABLE "Project" ADD COLUMN "sprintsEnabled" BOOLEAN NOT NULL DEFAULT true;
