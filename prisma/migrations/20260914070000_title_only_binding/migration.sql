-- Title is the only bound field. Value, Companies, and Contacts become
-- user-created fields (Number / Relation), not system rows.

DELETE FROM "CustomField"
WHERE "entityType" = 'deal'
  AND "binding" IN ('value', 'companies', 'contacts');
