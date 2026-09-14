-- Turn a blueprint off without deleting it. Off means the board is open:
-- any move is allowed and transition actions do not run. The canvas and
-- its arrows stay put and come back into force when it is switched on.

ALTER TABLE "Workflow" ADD COLUMN "blueprintEnabled" BOOLEAN NOT NULL DEFAULT true;
