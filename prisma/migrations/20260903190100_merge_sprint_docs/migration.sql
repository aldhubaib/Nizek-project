-- Fold each sprint's review document into its planning document.
--
-- The two were always one thing seen at two moments: the same sprint, the same
-- tasks, the same information table. The review only regrouped the task list by
-- outcome and added a reason per unfinished item. Keeping them apart meant two
-- rows, two titles kept in sync with each other, two chat cards pointing at
-- different documents, and two sets of permissions over one sprint.
--
-- The planning row survives, because it is the one the sprint's history hangs
-- off and the one older chat cards already link to. The review's sections are
-- appended below a sprint-outcome marker, and everything that pointed at the
-- review row is repointed at the survivor before the row goes.

-- Nothing here is recoverable from the merged content alone, so keep the rows.
CREATE TABLE "_SprintDocMergeBackup" AS
SELECT *, now() AS "backedUpAt"
FROM "MeetingNote"
WHERE "noteType" IN ('SPRINT_PLANNING', 'SPRINT_REVIEW');

-- Sprints holding both documents: which row survives, which is folded in.
CREATE TEMP TABLE sprint_doc_merge AS
SELECT
    plan.id      AS keep_id,
    review.id    AS drop_id,
    review.content AS review_content
FROM "MeetingNote" plan
JOIN "MeetingNote" review
  ON review."sprintId" = plan."sprintId"
 AND review."projectId" = plan."projectId"
 AND review."noteType" = 'SPRINT_REVIEW'
WHERE plan."noteType" = 'SPRINT_PLANNING'
  AND plan."sprintId" IS NOT NULL;

-- Append the review's outcome sections under the marker the editor splits on.
-- Everything above "Completed Sprint Items" in a review document is a second
-- copy of the information table and introduction, which the plan already has.
UPDATE "MeetingNote" n
SET content = n.content
           || '<div data-type="sprint-outcome"></div>'
           || substring(m.review_content FROM position('<h2>Completed Sprint Items</h2>' IN m.review_content))
FROM sprint_doc_merge m
WHERE n.id = m.keep_id
  AND position('<h2>Completed Sprint Items</h2>' IN m.review_content) > 0;

-- Comment threads, edit history and reminders move to the surviving row.
UPDATE "NoteCommentThread" t SET "noteId" = m.keep_id
FROM sprint_doc_merge m WHERE t."noteId" = m.drop_id;

UPDATE "NoteHistory" h SET "noteId" = m.keep_id
FROM sprint_doc_merge m WHERE h."noteId" = m.drop_id;

-- Task links are unique per (note, task): a task linked to both documents would
-- collide, and the survivor's own link is the one to keep.
DELETE FROM "NoteTaskLink" l
USING sprint_doc_merge m
WHERE l."noteId" = m.drop_id
  AND EXISTS (
      SELECT 1 FROM "NoteTaskLink" keep
      WHERE keep."noteId" = m.keep_id AND keep."taskId" = l."taskId"
  );

UPDATE "NoteTaskLink" l SET "noteId" = m.keep_id
FROM sprint_doc_merge m WHERE l."noteId" = m.drop_id;

DELETE FROM "DeadlineReminderLog" d
USING sprint_doc_merge m
WHERE d."noteId" = m.drop_id
  AND EXISTS (
      SELECT 1 FROM "DeadlineReminderLog" keep
      WHERE keep."noteId" = m.keep_id AND keep."offsetDays" = d."offsetDays"
  );

UPDATE "DeadlineReminderLog" d SET "noteId" = m.keep_id
FROM sprint_doc_merge m WHERE d."noteId" = m.drop_id;

-- Audit reports name a note by id without a foreign key.
UPDATE "TaskAuditItem" a SET "noteId" = m.keep_id
FROM sprint_doc_merge m WHERE a."noteId" = m.drop_id;

-- Sprint review cards already in chat carry the note id inside their body, as
-- plain JSON behind a <!--note-activity: prefix. Left alone they would open a
-- document that no longer exists.
UPDATE "Message" msg
SET body = replace(msg.body, m.drop_id, m.keep_id)
FROM sprint_doc_merge m
WHERE msg.body LIKE '%' || m.drop_id || '%';

DELETE FROM "MeetingNote" WHERE id IN (SELECT drop_id FROM sprint_doc_merge);

-- Whatever is left against a sprint is that sprint's document, including the
-- review-only rows of sprints whose planning document was never opened.
UPDATE "MeetingNote"
SET "noteType" = 'SPRINT_DOC'
WHERE "noteType" IN ('SPRINT_PLANNING', 'SPRINT_REVIEW')
  AND "sprintId" IS NOT NULL;

-- "Sprint 16 planning" and "Sprint 16 review" were two names for one document.
UPDATE "MeetingNote"
SET title = regexp_replace(title, '\s+(planning|review)\s*$', '', 'i')
WHERE "noteType" = 'SPRINT_DOC'
  AND regexp_replace(title, '\s+(planning|review)\s*$', '', 'i') <> '';

-- The collaboration server stores its own copy of the document here and hands
-- it back on the next connection. Left in place it would overwrite the merge
-- with the plan-only text the moment someone opened the document.
UPDATE "MeetingNote" SET ydoc = NULL WHERE "noteType" = 'SPRINT_DOC';

DROP TABLE sprint_doc_merge;
