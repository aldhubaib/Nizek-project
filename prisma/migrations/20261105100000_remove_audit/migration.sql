-- Remove the Task Audit module: per-team audit grants, the daily audit reports
-- and their snapshotted items. This drops data. The manager overview, which
-- was gated on these grants, is now open to system admins only.

DROP TABLE IF EXISTS "TaskAuditItem";
DROP TABLE IF EXISTS "TaskAudit";
DROP TABLE IF EXISTS "AuditPermission";
