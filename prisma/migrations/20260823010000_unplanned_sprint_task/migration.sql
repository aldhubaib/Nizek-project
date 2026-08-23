-- Tasks added after a sprint starts are unplanned.
ALTER TABLE "Task" ADD COLUMN "unplannedInSprint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SprintTaskSnapshot" ADD COLUMN "unplannedInSprint" BOOLEAN NOT NULL DEFAULT false;
