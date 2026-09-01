-- Priority moves from a free 1-10 integer to five named levels, with NORMAL as
-- the midpoint and the default for every new task.
--
-- Existing numbers are bucketed onto the new scale rather than discarded, and
-- tasks that never had a priority land on NORMAL, which is the new baseline
-- rather than an "unset" state.

CREATE TYPE "TaskPriority" AS ENUM ('VERY_LOW', 'LOW', 'NORMAL', 'HIGH', 'VERY_HIGH');

ALTER TABLE "Task"
  ALTER COLUMN "priority" DROP DEFAULT;

ALTER TABLE "Task"
  ALTER COLUMN "priority" TYPE "TaskPriority"
  USING (
    CASE
      WHEN "priority" IS NULL THEN 'NORMAL'
      WHEN "priority" <= 2 THEN 'VERY_LOW'
      WHEN "priority" <= 4 THEN 'LOW'
      WHEN "priority" <= 6 THEN 'NORMAL'
      WHEN "priority" <= 8 THEN 'HIGH'
      ELSE 'VERY_HIGH'
    END
  )::"TaskPriority";

ALTER TABLE "Task"
  ALTER COLUMN "priority" SET DEFAULT 'NORMAL';

ALTER TABLE "Task"
  ALTER COLUMN "priority" SET NOT NULL;
