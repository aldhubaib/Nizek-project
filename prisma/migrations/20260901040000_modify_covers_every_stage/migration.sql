-- Stage permissions used to offer only the five stages a person can drag a task
-- between. Modify, though, is checked against whatever stage the task actually
-- sits in, and a task inside a planned, next, completed or shipped sprint sits
-- in a stage that had no checkbox. A role that configured modify at all was
-- therefore restricted to the five it could tick, and nobody could edit a task
-- once its sprint was scheduled.
--
-- The four sprint-driven stages are added to every role that already lists any
-- modify stage, which restores editing where it was plainly intended. Roles
-- that list none are left alone: they either grant modify everywhere through
-- canModifyTask or grant it nowhere, and both already behave correctly.
--
-- Untouched keys in the blob (the per-stage transitions, and the legacy _create
-- list) are preserved — only _modify is rewritten.

UPDATE "ProjectRole" AS r
SET "allowedTransitions" = jsonb_set(
  r."allowedTransitions"::jsonb,
  '{_modify}',
  (
    SELECT jsonb_agg(stage ORDER BY array_position(
      ARRAY[
        'BACKLOG', 'PLANNED', 'NEXT', 'TODO', 'IN_DEVELOPMENT',
        'INTERNAL_REVIEW', 'DONE', 'COMPLETED', 'SHIPPED'
      ],
      stage
    ))
    FROM (
      SELECT jsonb_array_elements_text(r."allowedTransitions"::jsonb -> '_modify') AS stage
      UNION
      SELECT unnest(ARRAY['PLANNED', 'NEXT', 'COMPLETED', 'SHIPPED']) AS stage
    ) AS merged
  )
)::text
-- Nested CASE rather than a chain of ANDs: a WHERE clause has no guaranteed
-- evaluation order, so a flat version reached jsonb_array_length on a role whose
-- _modify was not an array and aborted the deploy. Each step here only runs once
-- the one before it has vouched for the value.
WHERE CASE
  WHEN r."allowedTransitions" IS NULL THEN false
  WHEN r."allowedTransitions" !~ '^\s*\{' THEN false
  ELSE CASE
    WHEN jsonb_typeof(r."allowedTransitions"::jsonb -> '_modify') <> 'array' THEN false
    ELSE jsonb_array_length(r."allowedTransitions"::jsonb -> '_modify') > 0
  END
END;
