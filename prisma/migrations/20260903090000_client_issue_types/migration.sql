-- Which issue types a client may raise from the New Issue action in their chat.
--
-- Empty by default, and the application treats empty as "hide the action", so
-- this migration cannot open a reporting path on its own. An admin has to pick
-- the types in the Questions tab before any client sees the option.

ALTER TABLE "AppSettings"
    ADD COLUMN "clientIssueTypes" "TaskType"[] DEFAULT ARRAY[]::"TaskType"[];

UPDATE "AppSettings" SET "clientIssueTypes" = ARRAY[]::"TaskType"[] WHERE "clientIssueTypes" IS NULL;

ALTER TABLE "AppSettings" ALTER COLUMN "clientIssueTypes" SET NOT NULL;
