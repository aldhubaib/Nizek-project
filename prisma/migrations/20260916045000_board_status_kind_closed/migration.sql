-- Existing board "Done" (and common aliases) count as closed for task reports.

UPDATE "WorkflowStatus" AS status
SET "kind" = 'closed'
FROM "Workflow" AS flow
WHERE status."workflowId" = flow.id
  AND flow."entityType" = 'board'
  AND status.kind = 'open'
  AND lower(status.name) IN ('done', 'closed', 'complete', 'completed');
