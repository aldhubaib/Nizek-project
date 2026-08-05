-- What a person is on a team becomes a role picked from the shared registry
-- (the same list equity entries pick from), so the capacity reads identically
-- across projects and a rename follows every lineup already written.
ALTER TABLE "EquityTeamMember" ADD COLUMN "roleId" TEXT;
ALTER TABLE "EquityTeamMember" ADD CONSTRAINT "EquityTeamMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "EquityRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "EquityTeamMember_roleId_idx" ON "EquityTeamMember"("roleId");

-- Titles typed by hand that already spell a role's name adopt that role; the
-- rest keep reading from "title" until their lineup is edited.
UPDATE "EquityTeamMember" AS m
SET "roleId" = r."id"
FROM "EquityRole" AS r
WHERE m."roleId" IS NULL
  AND lower(trim(m."title")) = lower(trim(r."name"));
